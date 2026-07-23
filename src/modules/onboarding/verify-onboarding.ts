import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db, postgresClient } from "@/db/client";
import {
  drillCreationKeys,
  drills,
  tags,
  trainingMethods,
  users,
} from "@/db/schema";
import type { CurrentAppUser } from "@/modules/auth";
import { createDrillPayloadHash } from "@/modules/drills/idempotency";
import {
  CreateDrillIdempotencyError,
  CreateDrillIdempotencyGoneError,
  deleteDrill,
  updateDrill,
} from "@/modules/drills/mutations";
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
  const userC = fixtureUser(`onboard_c_${suffix}`, "onboard-c@example.com");
  const userD = fixtureUser(`onboard_d_${suffix}`, "onboard-d@example.com");

  try {
    await db.insert(users).values([
      { id: userA.id, displayName: userA.displayName },
      { id: userB.id, displayName: userB.displayName },
      { id: userC.id, displayName: userC.displayName },
      { id: userD.id, displayName: userD.displayName },
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

    const input = {
      title: "Onboarding Verification Drill",
      summary: "",
      notes: null,
      steps: ["Perform the first action."],
      trainingMethodSlugs: [method.slug],
      tagSlugs: [],
      statusTagSlugs: [],
    };
    const creationKey = randomUUID();
    const immutableTagSlug = `immutable-retry-${suffix}`;
    const [immutableTag] = await db
      .insert(tags)
      .values({
        userId: userA.id,
        name: "Immutable Retry Tag",
        slug: immutableTagSlug,
        kind: "custom",
      })
      .returning({ id: tags.id });
    const immutableInput = {
      ...input,
      tagSlugs: [immutableTagSlug],
    };
    const drill = await createGuidedFirstDrill(userA.id, immutableInput, creationKey);
    assert.equal(drill.title, "Onboarding Verification Drill");
    const [storedContract] = await db
      .select({
        drillId: drillCreationKeys.drillId,
        payloadHash: drillCreationKeys.payloadHash,
      })
      .from(drillCreationKeys)
      .where(and(
        eq(drillCreationKeys.userId, userA.id),
        eq(drillCreationKeys.creationKey, creationKey),
      ))
      .limit(1);
    assert.equal(storedContract?.payloadHash, createDrillPayloadHash(immutableInput));
    assert.equal(storedContract?.drillId, drill.id);

    const editedTitle = "Edited After Original Save";
    await updateDrill(userA.id, drill.id, {
      ...immutableInput,
      title: editedTitle,
    });
    await db.update(tags).set({ active: false }).where(eq(tags.id, immutableTag.id));

    const identicalRetry = await createGuidedFirstDrill(userA.id, immutableInput, creationKey);
    assert.equal(identicalRetry.id, drill.id, "An identical retry must return the original drill.");
    assert.equal(
      identicalRetry.title,
      editedTitle,
      "A retry must return the owned drill without reconstructing its original payload.",
    );

    await assert.rejects(
      createGuidedFirstDrill(userA.id, { ...immutableInput, title: editedTitle }, creationKey),
      (error: unknown) => error instanceof CreateDrillIdempotencyError,
    );

    await deleteDrill(userA.id, drill.id);
    await assert.rejects(
      createGuidedFirstDrill(userA.id, immutableInput, creationKey),
      (error: unknown) => error instanceof CreateDrillIdempotencyGoneError,
    );
    await assert.rejects(
      createGuidedFirstDrill(userA.id, { ...immutableInput, title: editedTitle }, creationKey),
      (error: unknown) => (
        error instanceof CreateDrillIdempotencyError
        && !(error instanceof CreateDrillIdempotencyGoneError)
      ),
    );
    const [deletedLedger] = await db
      .select({ drillId: drillCreationKeys.drillId })
      .from(drillCreationKeys)
      .where(and(
        eq(drillCreationKeys.userId, userA.id),
        eq(drillCreationKeys.creationKey, creationKey),
      ))
      .limit(1);
    assert.equal(deletedLedger?.drillId, null, "Deleting a drill must tombstone, not free, its creation key.");

    const responseLossKey = randomUUID();
    let responseLostDrillId: string | null = null;
    await assert.rejects(async () => {
      const responseLostDrill = await createGuidedFirstDrill(
        userA.id,
        { ...input, title: "Response Loss Drill" },
        responseLossKey,
      );
      responseLostDrillId = responseLostDrill.id;
      throw new Error("Simulated response loss.");
    }, /Simulated response loss/);
    const responseLossRetry = await createGuidedFirstDrill(
      userA.id,
      { ...input, title: "Response Loss Drill" },
      responseLossKey,
    );
    assert.equal(responseLossRetry.id, responseLostDrillId);

    const concurrentKey = randomUUID();
    const concurrentDrills = await Promise.all([
      createGuidedFirstDrill(
        userA.id,
        { ...input, title: "Concurrent Retry Drill" },
        concurrentKey,
      ),
      createGuidedFirstDrill(
        userA.id,
        { ...input, title: "Concurrent Retry Drill" },
        concurrentKey,
      ),
    ]);
    assert.equal(concurrentDrills[0].id, concurrentDrills[1].id);
    const concurrentRows = await db
      .select({ drillId: drillCreationKeys.drillId })
      .from(drillCreationKeys)
      .where(and(
        eq(drillCreationKeys.userId, userA.id),
        eq(drillCreationKeys.creationKey, concurrentKey),
      ));
    assert.equal(concurrentRows.length, 1);
    assert.equal(concurrentRows[0]?.drillId, concurrentDrills[0].id);

    const competingKey = randomUUID();
    const competingResults = await Promise.allSettled([
      createGuidedFirstDrill(
        userA.id,
        { ...input, title: "Competing Payload A" },
        competingKey,
      ),
      createGuidedFirstDrill(
        userA.id,
        { ...input, title: "Competing Payload B" },
        competingKey,
      ),
    ]);
    assert.equal(competingResults.filter((result) => result.status === "fulfilled").length, 1);
    const competingFailure = competingResults.find((result) => result.status === "rejected");
    assert.ok(
      competingFailure?.status === "rejected"
      && competingFailure.reason instanceof CreateDrillIdempotencyError,
      "Concurrent payload misuse must reject the losing request.",
    );
    const competingLedgerRows = await db
      .select({ drillId: drillCreationKeys.drillId })
      .from(drillCreationKeys)
      .where(and(
        eq(drillCreationKeys.userId, userA.id),
        eq(drillCreationKeys.creationKey, competingKey),
      ));
    assert.equal(competingLedgerRows.length, 1);
    assert.ok(competingLedgerRows[0]?.drillId);

    const completed = await db.query.users.findFirst({ where: (table, operators) => operators.eq(table.id, userA.id) });
    assert.ok(completed?.profileOnboardedAt);
    assert.ok(completed?.firstDrillGuideCompletedAt);
    assert.equal(completed?.firstDrillGuideSkippedAt, null);

    await completeProfileOnboarding(userB, { username: `second_${suffix}`, firstName: "", lastName: "", location: "" });
    assert.equal(await skipFirstDrillGuide(userB.id), true);
    const skipped = await db.query.users.findFirst({ where: (table, operators) => operators.eq(table.id, userB.id) });
    assert.ok(skipped?.firstDrillGuideSkippedAt);
    assert.equal(await skipFirstDrillGuide(userB.id), true);
    const skippedAgain = await db.query.users.findFirst({ where: (table, operators) => operators.eq(table.id, userB.id) });
    assert.equal(
      skippedAgain?.firstDrillGuideSkippedAt?.getTime(),
      skipped.firstDrillGuideSkippedAt.getTime(),
      "An identical Skip must preserve its original timestamp.",
    );

    await createGuidedFirstDrill(
      userB.id,
      { ...input, title: "Replay After Skip Drill" },
      randomUUID(),
    );
    const replayed = await db.query.users.findFirst({ where: (table, operators) => operators.eq(table.id, userB.id) });
    assert.ok(replayed?.firstDrillGuideCompletedAt);
    assert.equal(replayed?.firstDrillGuideSkippedAt, null);
    assert.equal(await skipFirstDrillGuide(userB.id), false);

    await completeProfileOnboarding(userC, { username: `race_${suffix}`, firstName: "", lastName: "", location: "" });
    await Promise.all([
      createGuidedFirstDrill(
        userC.id,
        { ...input, title: "Concurrent Save Skip Drill" },
        randomUUID(),
      ),
      skipFirstDrillGuide(userC.id),
    ]);
    const raced = await db.query.users.findFirst({ where: (table, operators) => operators.eq(table.id, userC.id) });
    assert.ok(raced?.firstDrillGuideCompletedAt);
    assert.equal(raced?.firstDrillGuideSkippedAt, null);

    await completeProfileOnboarding(userD, { username: `scoped_${suffix}`, firstName: "", lastName: "", location: "" });
    const scopedKeyDrill = await createGuidedFirstDrill(userD.id, input, creationKey);
    assert.notEqual(scopedKeyDrill.id, drill.id, "Creation keys must be scoped to the owning user.");

    console.log(
      "Onboarding verification passed: durable scoped idempotency, deletion tombstones, response-loss retries, concurrency, and terminal guide state are stable.",
    );
  } finally {
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(users).where(eq(users.id, userB.id));
    await db.delete(users).where(eq(users.id, userC.id));
    await db.delete(users).where(eq(users.id, userD.id));
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
