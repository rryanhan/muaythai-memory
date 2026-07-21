import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db, postgresClient } from "@/db/client";
import { trainingMethods, users } from "@/db/schema";
import type { CurrentAppUser } from "@/modules/auth";
import {
  completeProfileOnboarding,
  createGuidedFirstDrill,
  OnboardingValidationError,
  skipFirstDrillGuide,
} from "./mutations";

async function main() {
  const suffix = Date.now().toString(36);
  const userA = fixtureUser(`onboard_a_${suffix}`, "onboard-a@example.com");
  const userB = fixtureUser(`onboard_b_${suffix}`, "onboard-b@example.com");

  try {
    await db.insert(users).values([
      { id: userA.id, displayName: userA.displayName },
      { id: userB.id, displayName: userB.displayName },
    ]);

    const username = await completeProfileOnboarding(userA, {
      username: `Fighter_${suffix}`,
      firstName: "Test",
      lastName: "Fighter",
      location: "Vancouver",
    });
    assert.equal(username, `fighter_${suffix}`);

    await assert.rejects(
      completeProfileOnboarding(userB, {
        username: username.toUpperCase(),
        firstName: "",
        lastName: "",
        location: "",
      }),
      (error: unknown) => error instanceof OnboardingValidationError && error.status === 409,
    );

    const [method] = await db
      .select({ slug: trainingMethods.slug })
      .from(trainingMethods)
      .where(eq(trainingMethods.active, true))
      .orderBy(asc(trainingMethods.sortOrder))
      .limit(1);
    assert.ok(method);

    const drill = await createGuidedFirstDrill(userA.id, {
      title: "Onboarding Verification Drill",
      summary: "",
      notes: null,
      steps: ["Perform the first action."],
      trainingMethodSlugs: [method.slug],
      tagSlugs: [],
      statusTagSlugs: [],
    });
    assert.equal(drill.title, "Onboarding Verification Drill");

    const completed = await db.query.users.findFirst({ where: (table, operators) => operators.eq(table.id, userA.id) });
    assert.ok(completed?.profileOnboardedAt);
    assert.ok(completed?.firstDrillGuideCompletedAt);
    assert.equal(completed?.firstDrillGuideSkippedAt, null);

    await completeProfileOnboarding(userB, { username: `second_${suffix}`, firstName: "", lastName: "", location: "" });
    await skipFirstDrillGuide(userB.id);
    const skipped = await db.query.users.findFirst({ where: (table, operators) => operators.eq(table.id, userB.id) });
    assert.ok(skipped?.firstDrillGuideSkippedAt);

    console.log("Onboarding verification passed: profile validation, username uniqueness, guided creation, and skip state are stable.");
  } finally {
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(users).where(eq(users.id, userB.id));
  }
}

function fixtureUser(displayName: string, email: string): CurrentAppUser {
  return {
    id: randomUUID(),
    displayName,
    username: null,
    firstName: null,
    lastName: null,
    location: null,
    avatarUrl: null,
    email,
    profileOnboardedAt: null,
    firstDrillGuideCompletedAt: null,
    firstDrillGuideSkippedAt: null,
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await postgresClient.end();
});
