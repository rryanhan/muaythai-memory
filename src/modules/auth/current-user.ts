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

export type CurrentAppUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
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

  if (existingUser) return toCurrentAppUser(existingUser, email);

  const [appUser] = await db
    .insert(users)
    .values({ id, displayName: initialDisplayName })
    .onConflictDoNothing({ target: users.id })
    .returning();

  if (appUser) return toCurrentAppUser(appUser, email);

  // Another concurrent first request may have inserted the row after our read.
  const racedUser = await db.query.users.findFirst({
    where: (table, operators) => operators.eq(table.id, id),
  });

  if (!racedUser) throw new Error("Authenticated app user could not be synchronized.");
  return toCurrentAppUser(racedUser, email);
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
  appUser: { id: string; displayName: string; avatarUrl: string | null },
  email: string | null,
): CurrentAppUser {
  return {
    id: appUser.id,
    displayName: appUser.displayName,
    avatarUrl: appUser.avatarUrl,
    email,
  };
}

function deriveDisplayName(metadata: Record<string, unknown>, email: string | null): string {
  const candidate = metadata.display_name ?? metadata.full_name ?? metadata.name;
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim().slice(0, 120);

  const emailPrefix = email?.split("@")[0]?.trim();
  return emailPrefix || "Fighter";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
