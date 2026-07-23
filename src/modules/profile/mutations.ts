import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { CurrentAppUser } from "@/modules/auth";
import {
  getOwnedProfileAvatarPath,
  listProfileAvatarPaths,
  prepareProfileAvatarUpload,
  removeUploadedAvatar,
  uploadPreparedProfileAvatar,
  type PreparedAvatarUpload,
} from "./avatar";
import {
  profileFirstNameSchema,
  profileLastNameSchema,
  profileLocationSchema,
  profileUsernameSchema,
  type ProfileDto,
} from "./contracts";

export type UpdateProfileInput = {
  username: string;
  firstName: string;
  lastName: string;
  location: string;
  avatar: File | null;
  removeAvatar: boolean;
};

export class ProfileUpdateError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ProfileUpdateError";
    this.status = status;
  }
}

export async function updateProfile(currentUser: CurrentAppUser, input: UpdateProfileInput): Promise<ProfileDto> {
  const profile = parseProfileFields(input);
  if (input.avatar && input.removeAvatar) {
    throw new ProfileUpdateError("Choose either a new profile photo or remove the existing one.");
  }

  try {
    if (input.avatar) {
      const upload = await prepareProfileAvatarUpload(currentUser.id, input.avatar);
      return await updateProfileWithAvatar(currentUser, profile, upload);
    }

    const outcome = await updateProfileWithoutAvatar(
      currentUser.id,
      profile,
      input.removeAvatar,
    );
    await cleanupCommittedProfileAvatars(currentUser.id, outcome.previousAvatarPath);
    return { ...outcome.updatedUser, email: currentUser.email };
  } catch (error) {
    if (isUniqueUsernameError(error)) {
      throw new ProfileUpdateError("That username is already taken.", 409);
    }
    throw error;
  }
}

type ParsedProfileFields = ReturnType<typeof parseProfileFields>;
type ProfileTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const profileReturning = {
  id: users.id,
  displayName: users.displayName,
  username: users.username,
  firstName: users.firstName,
  lastName: users.lastName,
  location: users.location,
  avatarUrl: users.avatarUrl,
};

async function updateProfileWithAvatar(
  currentUser: CurrentAppUser,
  profile: ParsedProfileFields,
  upload: PreparedAvatarUpload,
): Promise<ProfileDto> {
  const claim = await claimProfileAvatar(currentUser.id, upload.publicUrl);

  try {
    await uploadPreparedProfileAvatar(upload);
  } catch (error) {
    await rollbackAvatarClaim(currentUser.id, claim).catch((rollbackError) => {
      logAvatarCleanupError("Profile avatar claim rollback failed.", rollbackError);
    });
    await cleanupUnusedAvatarUpload(currentUser.id, upload);
    throw error;
  }

  let updatedUser: Omit<ProfileDto, "email"> | null;
  try {
    updatedUser = await finalizeAvatarClaim(currentUser.id, profile, upload.publicUrl, claim);
  } catch (error) {
    await rollbackAvatarClaim(currentUser.id, claim).catch((rollbackError) => {
      logAvatarCleanupError("Profile avatar claim rollback failed.", rollbackError);
    });
    await cleanupUnusedAvatarUpload(currentUser.id, upload);
    throw error;
  }

  if (!updatedUser) {
    await cleanupUnusedAvatarUpload(currentUser.id, upload);
    throw new ProfileUpdateError(
      "A newer profile photo change replaced this upload. Try again.",
      409,
    );
  }

  const previousAvatarPath = getOwnedProfileAvatarPath(
    currentUser.id,
    claim.previousAvatarUrl,
  );
  await cleanupCommittedProfileAvatars(currentUser.id, previousAvatarPath);
  return { ...updatedUser, email: currentUser.email };
}

async function updateProfileWithoutAvatar(
  userId: string,
  profile: ParsedProfileFields,
  removeAvatar: boolean,
): Promise<{
  updatedUser: Omit<ProfileDto, "email">;
  previousAvatarPath: string | null;
}> {
  return db.transaction(async (tx) => {
    const current = await getLockedProfileAvatar(tx, userId);
    if (!current) throw new ProfileUpdateError("Profile could not be found.", 404);

    const stableAvatarUrl = getStableProfileAvatarUrl(userId, current.avatarUrl);
    const values = profileUpdateValues(profile);
    if (removeAvatar) values.avatarUrl = null;

    const [updatedUser] = await tx
      .update(users)
      .set(values)
      .where(eq(users.id, userId))
      .returning(profileReturning);
    if (!updatedUser) throw new ProfileUpdateError("Profile could not be found.", 404);

    return {
      updatedUser,
      previousAvatarPath: removeAvatar
        ? getOwnedProfileAvatarPath(userId, stableAvatarUrl)
        : null,
    };
  });
}

type AvatarClaim = {
  claimUrl: string;
  previousAvatarUrl: string | null;
  targetAvatarUrl: string;
};

const AVATAR_CLAIM_MARKER = "#profile-avatar-claim=";

async function claimProfileAvatar(
  userId: string,
  targetAvatarUrl: string,
): Promise<AvatarClaim> {
  const attempt: { claim: AvatarClaim | null } = { claim: null };
  try {
    return await db.transaction(async (tx) => {
      const current = await getLockedProfileAvatar(tx, userId);
      if (!current) throw new ProfileUpdateError("Profile could not be found.", 404);

      const previousAvatarUrl = getStableProfileAvatarUrl(userId, current.avatarUrl);
      const claimUrl = createAvatarClaimUrl(previousAvatarUrl, targetAvatarUrl);
      attempt.claim = { claimUrl, previousAvatarUrl, targetAvatarUrl };
      const [claimed] = await tx
        .update(users)
        .set({ avatarUrl: claimUrl, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      if (!claimed) throw new ProfileUpdateError("Profile could not be found.", 404);

      return attempt.claim;
    });
  } catch (error) {
    const attemptedClaim = attempt.claim;
    if (
      attemptedClaim
      && await getCurrentProfileAvatarUrl(userId) === attemptedClaim.claimUrl
    ) {
      return attemptedClaim;
    }
    throw error;
  }
}

async function finalizeAvatarClaim(
  userId: string,
  profile: ParsedProfileFields,
  targetAvatarUrl: string,
  claim: AvatarClaim,
): Promise<Omit<ProfileDto, "email"> | null> {
  return db.transaction(async (tx) => {
    const current = await getLockedProfileAvatar(tx, userId);
    if (!current || current.avatarUrl !== claim.claimUrl) return null;

    const [updatedUser] = await tx
      .update(users)
      .set({ ...profileUpdateValues(profile), avatarUrl: targetAvatarUrl })
      .where(eq(users.id, userId))
      .returning(profileReturning);
    return updatedUser ?? null;
  });
}

async function rollbackAvatarClaim(userId: string, claim: AvatarClaim): Promise<void> {
  await db.transaction(async (tx) => {
    const current = await getLockedProfileAvatar(tx, userId);
    if (!current || current.avatarUrl !== claim.claimUrl) return;

    await tx
      .update(users)
      .set({ avatarUrl: claim.previousAvatarUrl, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
  });
}

async function getLockedProfileAvatar(tx: ProfileTransaction, userId: string) {
  const [current] = await tx
    .select({ avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .for("update", { of: users })
    .limit(1);
  return current ?? null;
}

async function getCurrentProfileAvatarUrl(userId: string): Promise<string | null | undefined> {
  const [current] = await db
    .select({ avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return current?.avatarUrl;
}

async function cleanupUnusedAvatarUpload(
  userId: string,
  upload: PreparedAvatarUpload,
): Promise<void> {
  await removeAvatarPathIfUnprotected(userId, upload.path).catch((error) => {
    logAvatarCleanupError("Unused profile avatar cleanup failed.", error);
  });
}

async function cleanupCommittedProfileAvatars(
  userId: string,
  previousAvatarPath: string | null,
): Promise<void> {
  if (previousAvatarPath) {
    await removeAvatarPathIfUnprotected(userId, previousAvatarPath).catch((error) => {
      logAvatarCleanupError("Profile avatar cleanup failed.", error);
    });
  }

  await reconcileProfileAvatarObjects(userId).catch((error) => {
    logAvatarCleanupError("Profile avatar reconciliation failed.", error);
  });
}

async function reconcileProfileAvatarObjects(userId: string): Promise<void> {
  const paths = await listProfileAvatarPaths(userId);
  for (const path of paths) await removeAvatarPathIfUnprotected(userId, path);
}

async function removeAvatarPathIfUnprotected(userId: string, path: string): Promise<void> {
  if (!path.startsWith(`${userId}/`)) return;

  const avatarUrl = await getCurrentProfileAvatarUrl(userId);
  if (avatarUrl === undefined) return;

  const protectedPaths = getProtectedProfileAvatarPaths(userId, avatarUrl);
  if (protectedPaths.has(path)) return;
  await removeUploadedAvatar(path);
}

function getProtectedProfileAvatarPaths(userId: string, avatarUrl: string | null): Set<string> {
  const paths = new Set<string>();
  const claim = parseAvatarClaim(userId, avatarUrl);
  const urls = claim
    ? [claim.previousAvatarUrl, claim.targetAvatarUrl]
    : [avatarUrl];
  for (const url of urls) {
    const path = getOwnedProfileAvatarPath(userId, url);
    if (path) paths.add(path);
  }
  return paths;
}

function getStableProfileAvatarUrl(userId: string, avatarUrl: string | null): string | null {
  return parseAvatarClaim(userId, avatarUrl)?.previousAvatarUrl ?? avatarUrl;
}

function createAvatarClaimUrl(
  previousAvatarUrl: string | null,
  targetAvatarUrl: string,
): string {
  const payload = encodeURIComponent(JSON.stringify({
    previousAvatarUrl,
    targetAvatarUrl,
  }));
  const baseUrl = (previousAvatarUrl ?? targetAvatarUrl).split("#", 1)[0];
  return `${baseUrl}${AVATAR_CLAIM_MARKER}${payload}`;
}

function parseAvatarClaim(userId: string, avatarUrl: string | null): AvatarClaim | null {
  if (!avatarUrl) return null;
  const markerIndex = avatarUrl.indexOf(AVATAR_CLAIM_MARKER);
  if (markerIndex === -1) return null;

  try {
    const payload = JSON.parse(decodeURIComponent(
      avatarUrl.slice(markerIndex + AVATAR_CLAIM_MARKER.length),
    )) as Record<string, unknown>;
    const previousAvatarUrl = payload.previousAvatarUrl;
    const targetAvatarUrl = payload.targetAvatarUrl;
    if (
      (previousAvatarUrl !== null && typeof previousAvatarUrl !== "string")
      || typeof targetAvatarUrl !== "string"
      || !getOwnedProfileAvatarPath(userId, targetAvatarUrl)
    ) {
      return null;
    }
    return {
      claimUrl: avatarUrl,
      previousAvatarUrl,
      targetAvatarUrl,
    };
  } catch {
    return null;
  }
}

function profileUpdateValues(profile: ParsedProfileFields): {
  displayName: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  location: string | null;
  avatarUrl?: string | null;
  updatedAt: Date;
} {
  return {
    displayName: profile.username,
    username: profile.username,
    firstName: profile.firstName,
    lastName: profile.lastName,
    location: profile.location,
    updatedAt: new Date(),
  };
}

function logAvatarCleanupError(message: string, error: unknown): void {
  console.error(message, error instanceof Error ? error.message : error);
}

function parseProfileFields(input: UpdateProfileInput) {
  const results = {
    username: profileUsernameSchema.safeParse(input.username),
    firstName: profileFirstNameSchema.safeParse(input.firstName),
    lastName: profileLastNameSchema.safeParse(input.lastName),
    location: profileLocationSchema.safeParse(input.location),
  };
  for (const result of Object.values(results)) {
    if (!result.success) {
      throw new ProfileUpdateError(result.error.issues[0]?.message ?? "Enter valid profile details.");
    }
  }
  return {
    username: results.username.data as string,
    firstName: results.firstName.data as string | null,
    lastName: results.lastName.data as string | null,
    location: results.location.data as string | null,
  };
}

function isUniqueUsernameError(error: unknown): boolean {
  return hasPostgresCode(error, "23505");
}

function hasPostgresCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === code) return true;
  return "cause" in error && hasPostgresCode(error.cause, code);
}
