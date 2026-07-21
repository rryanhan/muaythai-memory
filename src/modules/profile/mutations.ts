import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { CurrentAppUser } from "@/modules/auth";
import {
  removeOtherUserAvatars,
  removeUploadedAvatar,
  uploadProfileAvatar,
  type UploadedAvatar,
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

  let uploadedAvatar: UploadedAvatar | null = null;
  try {
    if (input.avatar) uploadedAvatar = await uploadProfileAvatar(currentUser.id, input.avatar);

    const avatarUrl = uploadedAvatar?.publicUrl ?? (input.removeAvatar ? null : currentUser.avatarUrl);
    const [updatedUser] = await db
      .update(users)
      .set({
        displayName: profile.username,
        username: profile.username,
        firstName: profile.firstName,
        lastName: profile.lastName,
        location: profile.location,
        avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, currentUser.id))
      .returning({
        id: users.id,
        displayName: users.displayName,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        location: users.location,
        avatarUrl: users.avatarUrl,
      });

    if (!updatedUser) throw new ProfileUpdateError("Profile could not be found.", 404);

    if (uploadedAvatar || input.removeAvatar) {
      await removeOtherUserAvatars(currentUser.id, uploadedAvatar?.path ?? null).catch((error) => {
        console.error("Profile avatar cleanup failed.", error instanceof Error ? error.message : error);
      });
    }

    return { ...updatedUser, email: currentUser.email };
  } catch (error) {
    if (uploadedAvatar) {
      await removeUploadedAvatar(uploadedAvatar.path).catch(() => undefined);
    }
    if (isUniqueUsernameError(error)) {
      throw new ProfileUpdateError("That username is already taken.", 409);
    }
    throw error;
  }
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
