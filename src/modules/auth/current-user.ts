import { cache } from "react";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export class AuthenticationRequiredError extends Error {
  readonly status = 401;

  constructor() {
    super("Authentication required.");
    this.name = "AuthenticationRequiredError";
  }
}

export class OnboardingRequiredError extends Error {
  readonly status = 403;

  constructor() {
    super("Complete onboarding before using this part of the app.");
    this.name = "OnboardingRequiredError";
  }
}

export type CurrentAppUser = {
  id: string;
  displayName: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  location: string | null;
  avatarUrl: string | null;
  email: string | null;
  profileOnboardedAt: Date | null;
  firstDrillGuideCompletedAt: Date | null;
  firstDrillGuideSkippedAt: Date | null;
};

type CurrentAuthIdentity = {
  id: string;
  email: string | null;
  metadata: Record<string, unknown>;
};

// Read paths only need the verified Auth UUID to enforce ownership. Keeping
// this separate avoids a users-table lookup on every drill or graph read.
export const requireCurrentUserId = cache(async (): Promise<string> => {
  return (await requireCurrentAuthIdentity()).id;
});

// Profile and write paths still synchronize the public app user before using
// profile fields or inserting rows with a users-table foreign key.
export const requireCurrentAppUser = cache(async (): Promise<CurrentAppUser> => {
  const { id, email, metadata } = await requireCurrentAuthIdentity();
  const initialDisplayName = deriveDisplayName(metadata, email);
  const existingUser = await db.query.users.findFirst({
    where: (table, operators) => operators.eq(table.id, id),
  });

  if (existingUser) return toCurrentAppUser(existingUser, email, metadata);

  const [appUser] = await db
    .insert(users)
    .values({ id, displayName: initialDisplayName })
    .onConflictDoNothing({ target: users.id })
    .returning();

  if (appUser) return toCurrentAppUser(appUser, email, metadata);

  // Another concurrent first request may have inserted the row after our read.
  const racedUser = await db.query.users.findFirst({
    where: (table, operators) => operators.eq(table.id, id),
  });

  if (!racedUser) throw new Error("Authenticated app user could not be synchronized.");
  return toCurrentAppUser(racedUser, email, metadata);
});

export const requireOnboardedAppUser = cache(async (): Promise<CurrentAppUser> => {
  const user = await requireCurrentAppUser();
  if (!isOnboardingComplete(user)) throw new OnboardingRequiredError();
  return user;
});

export const requireOnboardedUserId = cache(async (): Promise<string> => {
  return (await requireOnboardedAppUser()).id;
});

// React cache deduplicates claim verification within one server request
// without turning identity into long-lived shared state.
const requireCurrentAuthIdentity = cache(async (): Promise<CurrentAuthIdentity> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) throw new AuthenticationRequiredError();

  const id = String(claims.sub);
  const email = typeof claims.email === "string" ? claims.email : null;
  const metadata = isRecord(claims.user_metadata) ? claims.user_metadata : {};

  return { id, email, metadata };
});

function toCurrentAppUser(
  appUser: {
    id: string;
    displayName: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    location: string | null;
    avatarUrl: string | null;
    profileOnboardedAt: Date | null;
    firstDrillGuideCompletedAt: Date | null;
    firstDrillGuideSkippedAt: Date | null;
  },
  email: string | null,
  metadata: Record<string, unknown>,
): CurrentAppUser {
  const suggestedNames = appUser.profileOnboardedAt ? null : deriveNames(metadata);
  return {
    id: appUser.id,
    displayName: appUser.displayName,
    username: appUser.username,
    firstName: appUser.firstName ?? suggestedNames?.firstName ?? null,
    lastName: appUser.lastName ?? suggestedNames?.lastName ?? null,
    location: appUser.location,
    avatarUrl: appUser.avatarUrl,
    email,
    profileOnboardedAt: appUser.profileOnboardedAt,
    firstDrillGuideCompletedAt: appUser.firstDrillGuideCompletedAt,
    firstDrillGuideSkippedAt: appUser.firstDrillGuideSkippedAt,
  };
}

export function isProfileOnboarded(user: CurrentAppUser): boolean {
  return Boolean(user.profileOnboardedAt && user.username);
}

export function isOnboardingComplete(user: CurrentAppUser): boolean {
  return isProfileOnboarded(user) && Boolean(
    user.firstDrillGuideCompletedAt || user.firstDrillGuideSkippedAt,
  );
}

export function getOnboardingPath(user: CurrentAppUser, nextPath = "/"): string | null {
  const next = encodeURIComponent(nextPath);
  if (!isProfileOnboarded(user)) return `/onboarding/profile?next=${next}`;
  if (!isOnboardingComplete(user)) return `/onboarding/first-drill?next=${next}`;
  return null;
}

function deriveDisplayName(metadata: Record<string, unknown>, email: string | null): string {
  const candidate = metadata.display_name ?? metadata.full_name ?? metadata.name;
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim().slice(0, 120);

  const emailPrefix = email?.split("@")[0]?.trim();
  return emailPrefix || "Fighter";
}

function deriveNames(metadata: Record<string, unknown>): { firstName: string | null; lastName: string | null } {
  const givenName = stringValue(metadata.given_name);
  const familyName = stringValue(metadata.family_name);
  if (givenName || familyName) return { firstName: givenName, lastName: familyName };

  const fullName = stringValue(metadata.full_name) ?? stringValue(metadata.name);
  if (!fullName) return { firstName: null, lastName: null };
  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0]?.slice(0, 80) ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ").slice(0, 80) : null,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
