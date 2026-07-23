import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { CurrentAppUser } from "@/modules/auth";
import { createDrill } from "@/modules/drills/mutations";
import type { DrillDetail } from "@/modules/drills/contracts";
import {
  onboardingFirstDrillInputSchema,
  onboardingProfileInputSchema,
  type OnboardingFirstDrillInput,
  type OnboardingProfileInput,
} from "./contracts";

export class OnboardingValidationError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(message: string, status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = "OnboardingValidationError";
    this.status = status;
  }
}

export async function completeProfileOnboarding(
  currentUser: CurrentAppUser,
  rawInput: OnboardingProfileInput,
): Promise<string> {
  const parsed = onboardingProfileInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new OnboardingValidationError(parsed.error.issues[0]?.message ?? "Enter valid profile details.");
  }

  try {
    const [updated] = await db
      .update(users)
      .set({
        username: parsed.data.username,
        displayName: parsed.data.username,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        location: parsed.data.location,
        profileOnboardedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, currentUser.id))
      .returning({ username: users.username });

    if (!updated?.username) throw new OnboardingValidationError("Profile could not be found.", 404);
    return updated.username;
  } catch (error) {
    if (isUniqueUsernameError(error)) {
      throw new OnboardingValidationError("That username is already taken.", 409);
    }
    throw error;
  }
}

export async function createGuidedFirstDrill(
  userId: string,
  rawInput: OnboardingFirstDrillInput,
  creationKey: string,
): Promise<DrillDetail> {
  const input = onboardingFirstDrillInputSchema.parse(rawInput);
  return createDrill(userId, input, {
    completeFirstDrillGuide: true,
    creationKey,
  });
}

export async function skipFirstDrillGuide(userId: string): Promise<boolean> {
  const [updated] = await db
    .update(users)
    .set({
      firstDrillGuideCompletedAt: null,
      firstDrillGuideSkippedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(users.id, userId),
      isNull(users.firstDrillGuideCompletedAt),
      isNull(users.firstDrillGuideSkippedAt),
    ))
    .returning({ id: users.id });
  if (updated) return true;

  const [existing] = await db
    .select({
      completedAt: users.firstDrillGuideCompletedAt,
      skippedAt: users.firstDrillGuideSkippedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!existing) throw new OnboardingValidationError("Profile could not be found.", 404);
  return Boolean(existing.skippedAt && !existing.completedAt);
}

function isUniqueUsernameError(error: unknown): boolean {
  return hasPostgresCode(error, "23505");
}

function hasPostgresCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === code) return true;
  return "cause" in error && hasPostgresCode(error.cause, code);
}
