import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, postgresClient } from "./client";
import { authRecoveryGrants, users } from "./schema";
import {
  claimRecoveryGrant,
  cleanupOldRecoveryGrantRecords,
  issueRecoveryGrantRecord,
  markRecoveryGrantAmbiguous,
  markRecoveryGrantConsumed,
  markRecoveryGrantKnownFailure,
} from "@/modules/auth/recovery-store";
import { RECOVERY_GRANT_AUDIT_RETENTION_MS } from "@/modules/auth/recovery-retention";
import {
  createRecoveryGrant,
  fingerprintRecoveryPassword,
  getAuthFlowSecret,
} from "@/modules/auth/recovery-token";

async function main() {
  const secret = getAuthFlowSecret();
  const now = new Date();
  const userId = randomUUID();
  const sessionId = randomUUID();
  const firstPassword = "verify-password-one";
  const secondPassword = "verify-password-two";

  await db.insert(users).values({
    displayName: `Recovery Grant Verify ${now.getTime()}`,
    id: userId,
  });

  try {
    const concurrentGrant = createRecoveryGrant(
      { sessionId, userId },
      { now, secret },
    );
    await issueRecoveryGrantRecord({
      expiresAt: concurrentGrant.expiresAt,
      jtiHash: concurrentGrant.jtiHash,
      sessionHash: concurrentGrant.sessionHash,
      userId,
    });

    const firstFingerprint = fingerprintRecoveryPassword(
      firstPassword,
      concurrentGrant.jti,
      secret,
    );
    const secondFingerprint = fingerprintRecoveryPassword(
      secondPassword,
      concurrentGrant.jti,
      secret,
    );
    const claims = await Promise.all([
      claimRecoveryGrant({
        jtiHash: concurrentGrant.jtiHash,
        now,
        passwordFingerprint: firstFingerprint,
        sessionHash: concurrentGrant.sessionHash,
        sessionState: "matching",
        userId,
      }),
      claimRecoveryGrant({
        jtiHash: concurrentGrant.jtiHash,
        now,
        passwordFingerprint: secondFingerprint,
        sessionHash: concurrentGrant.sessionHash,
        sessionState: "matching",
        userId,
      }),
    ]);
    const executingIndex = claims.findIndex((result) => result.kind === "execute");
    expect(executingIndex >= 0, "Exactly one concurrent password should claim the grant.");
    expect(
      claims.filter((result) => result.kind === "execute").length === 1,
      "Concurrent different-password requests must not both execute.",
    );
    expect(
      claims.some(
        (result) =>
          result.kind === "rejected" && result.reason === "password-mismatch",
      ),
      "The losing concurrent password must be rejected.",
    );

    const executing = claims[executingIndex];
    if (!executing || executing.kind !== "execute") {
      throw new Error("Recovery execution claim was not retained.");
    }
    const winningFingerprint = executingIndex === 0
      ? firstFingerprint
      : secondFingerprint;
    const losingFingerprint = executingIndex === 0
      ? secondFingerprint
      : firstFingerprint;

    await markRecoveryGrantAmbiguous(executing.grantId, winningFingerprint, now);
    const samePasswordRetry = await claimRecoveryGrant({
      jtiHash: concurrentGrant.jtiHash,
      now,
      passwordFingerprint: winningFingerprint,
      sessionHash: concurrentGrant.sessionHash,
      sessionState: "missing",
      userId,
    });
    expect(
      samePasswordRetry.kind === "execute",
      "An ambiguous attempt must permit a same-password response-lost retry.",
    );
    const differentPasswordRetry = await claimRecoveryGrant({
      jtiHash: concurrentGrant.jtiHash,
      now,
      passwordFingerprint: losingFingerprint,
      sessionHash: concurrentGrant.sessionHash,
      sessionState: "missing",
      userId,
    });
    expect(
      differentPasswordRetry.kind === "rejected"
        && differentPasswordRetry.reason === "password-mismatch",
      "An ambiguous attempt must remain bound to one password.",
    );

    if (samePasswordRetry.kind !== "execute") {
      throw new Error("Same-password retry did not retain the grant row.");
    }
    await markRecoveryGrantConsumed(
      samePasswordRetry.grantId,
      winningFingerprint,
      now,
    );
    const consumedRetry = await claimRecoveryGrant({
      jtiHash: concurrentGrant.jtiHash,
      now,
      passwordFingerprint: winningFingerprint,
      sessionHash: concurrentGrant.sessionHash,
      sessionState: "missing",
      userId,
    });
    expect(
      consumedRetry.kind === "already-consumed",
      "A response-lost retry must idempotently acknowledge a consumed grant.",
    );

    const duplicateGrant = createRecoveryGrant(
      { sessionId, userId },
      { now, secret },
    );
    const duplicateFingerprint = fingerprintRecoveryPassword(
      firstPassword,
      duplicateGrant.jti,
      secret,
    );
    await issueRecoveryGrantRecord({
      expiresAt: duplicateGrant.expiresAt,
      jtiHash: duplicateGrant.jtiHash,
      sessionHash: duplicateGrant.sessionHash,
      userId,
    });
    const duplicateClaims = await Promise.all([
      claimRecoveryGrant({
        jtiHash: duplicateGrant.jtiHash,
        now,
        passwordFingerprint: duplicateFingerprint,
        sessionHash: duplicateGrant.sessionHash,
        sessionState: "matching",
        userId,
      }),
      claimRecoveryGrant({
        jtiHash: duplicateGrant.jtiHash,
        now,
        passwordFingerprint: duplicateFingerprint,
        sessionHash: duplicateGrant.sessionHash,
        sessionState: "matching",
        userId,
      }),
    ]);
    expect(
      duplicateClaims.filter((result) => result.kind === "execute").length === 1,
      "Concurrent same-password requests must make only one provider call.",
    );
    expect(
      duplicateClaims.some(
        (result) => result.kind === "rejected" && result.reason === "in-progress",
      ),
      "A concurrent same-password duplicate must report an active attempt.",
    );
    const staleAt = new Date(now.getTime() - 31_000);
    await db
      .update(authRecoveryGrants)
      .set({ updatedAt: staleAt })
      .where(eq(authRecoveryGrants.jtiHash, duplicateGrant.jtiHash));
    const staleRetry = await claimRecoveryGrant({
      jtiHash: duplicateGrant.jtiHash,
      now,
      passwordFingerprint: duplicateFingerprint,
      sessionHash: duplicateGrant.sessionHash,
      sessionState: "missing",
      userId,
    });
    expect(
      staleRetry.kind === "execute",
      "A stale same-password attempt must be recoverable after its lease expires.",
    );

    const knownFailureGrant = createRecoveryGrant(
      { sessionId, userId },
      { now, secret },
    );
    const knownFirstFingerprint = fingerprintRecoveryPassword(
      firstPassword,
      knownFailureGrant.jti,
      secret,
    );
    const knownSecondFingerprint = fingerprintRecoveryPassword(
      secondPassword,
      knownFailureGrant.jti,
      secret,
    );
    await issueRecoveryGrantRecord({
      expiresAt: knownFailureGrant.expiresAt,
      jtiHash: knownFailureGrant.jtiHash,
      sessionHash: knownFailureGrant.sessionHash,
      userId,
    });
    const initialKnownClaim = await claimRecoveryGrant({
      jtiHash: knownFailureGrant.jtiHash,
      now,
      passwordFingerprint: knownFirstFingerprint,
      sessionHash: knownFailureGrant.sessionHash,
      sessionState: "matching",
      userId,
    });
    if (initialKnownClaim.kind !== "execute") {
      throw new Error("Known-failure verification could not claim its grant.");
    }
    await markRecoveryGrantKnownFailure(
      initialKnownClaim.grantId,
      knownFirstFingerprint,
      now,
    );
    const replacementClaim = await claimRecoveryGrant({
      jtiHash: knownFailureGrant.jtiHash,
      now,
      passwordFingerprint: knownSecondFingerprint,
      sessionHash: knownFailureGrant.sessionHash,
      sessionState: "matching",
      userId,
    });
    expect(
      replacementClaim.kind === "execute",
      "A conclusive provider failure must safely release the password binding.",
    );

    const rows = await db
      .select({ passwordFingerprint: authRecoveryGrants.passwordFingerprint })
      .from(authRecoveryGrants)
      .where(eq(authRecoveryGrants.userId, userId));
    expect(
      rows.every(
        (row) =>
          row.passwordFingerprint !== firstPassword
          && row.passwordFingerprint !== secondPassword,
      ),
      "The durable ledger must never store plaintext passwords.",
    );

    await verifyCleanupRetention(userId, now);

    console.log(
      "Recovery grant verification passed for concurrency, ambiguity, idempotence, known failures, and bounded retention cleanup.",
    );
  } finally {
    await db.delete(users).where(eq(users.id, userId));
  }
}

async function verifyCleanupRetention(userId: string, now: Date) {
  const oldTimestamp = new Date(
    now.getTime() - RECOVERY_GRANT_AUDIT_RETENTION_MS - 60_000,
  );
  const recentTimestamp = new Date(now.getTime() - 60 * 60 * 1_000);
  const futureTimestamp = new Date(now.getTime() + 10 * 60 * 1_000);
  const oldIds = Array.from({ length: 4 }, () => randomUUID());
  const recentTerminalId = randomUUID();
  const recentlyExpiredId = randomUUID();
  const activeId = randomUUID();

  await db.insert(authRecoveryGrants).values([
    {
      createdAt: oldTimestamp,
      expiresAt: oldTimestamp,
      id: oldIds[0],
      jtiHash: randomUUID(),
      sessionHash: randomUUID(),
      updatedAt: oldTimestamp,
      userId,
    },
    {
      activeAttempts: 0,
      createdAt: oldTimestamp,
      expiresAt: oldTimestamp,
      id: oldIds[1],
      jtiHash: randomUUID(),
      outcomeUncertain: true,
      passwordFingerprint: "a".repeat(64),
      pendingAt: oldTimestamp,
      sessionHash: randomUUID(),
      state: "pending",
      updatedAt: oldTimestamp,
      userId,
    },
    {
      consumedAt: oldTimestamp,
      createdAt: oldTimestamp,
      expiresAt: oldTimestamp,
      id: oldIds[2],
      jtiHash: randomUUID(),
      passwordFingerprint: "b".repeat(64),
      pendingAt: oldTimestamp,
      sessionHash: randomUUID(),
      state: "consumed",
      updatedAt: oldTimestamp,
      userId,
    },
    {
      createdAt: oldTimestamp,
      expiresAt: oldTimestamp,
      failedAt: oldTimestamp,
      id: oldIds[3],
      jtiHash: randomUUID(),
      sessionHash: randomUUID(),
      state: "failed",
      updatedAt: oldTimestamp,
      userId,
    },
    {
      consumedAt: recentTimestamp,
      createdAt: oldTimestamp,
      expiresAt: oldTimestamp,
      id: recentTerminalId,
      jtiHash: randomUUID(),
      passwordFingerprint: "c".repeat(64),
      pendingAt: oldTimestamp,
      sessionHash: randomUUID(),
      state: "consumed",
      updatedAt: recentTimestamp,
      userId,
    },
    {
      createdAt: recentTimestamp,
      expiresAt: recentTimestamp,
      id: recentlyExpiredId,
      jtiHash: randomUUID(),
      sessionHash: randomUUID(),
      updatedAt: recentTimestamp,
      userId,
    },
    {
      expiresAt: futureTimestamp,
      id: activeId,
      jtiHash: randomUUID(),
      sessionHash: randomUUID(),
      userId,
    },
  ]);

  const firstBatch = await cleanupOldRecoveryGrantRecords({
    batchSize: 2,
    now,
  });
  expect(firstBatch === 2, "Cleanup must obey its requested batch bound.");

  const afterFirstBatch = await db
    .select({ id: authRecoveryGrants.id })
    .from(authRecoveryGrants)
    .where(
      inArray(authRecoveryGrants.id, [
        ...oldIds,
        recentTerminalId,
        recentlyExpiredId,
        activeId,
      ]),
    );
  const firstRemainingIds = new Set(afterFirstBatch.map((row) => row.id));
  expect(
    oldIds.filter((id) => firstRemainingIds.has(id)).length === 2,
    "The first cleanup batch must remove only two old records.",
  );
  expect(
    firstRemainingIds.has(recentTerminalId),
    "A recently consumed grant must remain available for audit.",
  );
  expect(
    firstRemainingIds.has(recentlyExpiredId),
    "A recently expired grant must remain available for audit.",
  );
  expect(firstRemainingIds.has(activeId), "An active grant must never be removed.");

  const secondBatch = await cleanupOldRecoveryGrantRecords({
    batchSize: 10,
    now,
  });
  expect(secondBatch === 2, "A later cleanup must remove the remaining old records.");
  const thirdBatch = await cleanupOldRecoveryGrantRecords({
    batchSize: 10,
    now,
  });
  expect(thirdBatch === 0, "Cleanup must be idempotent once old records are gone.");

  const protectedRows = await db
    .select({ id: authRecoveryGrants.id })
    .from(authRecoveryGrants)
    .where(
      inArray(authRecoveryGrants.id, [
        recentTerminalId,
        recentlyExpiredId,
        activeId,
      ]),
    );
  expect(
    protectedRows.length === 3,
    "Cleanup must preserve active and recently auditable grants.",
  );
}

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgresClient.end();
  });
