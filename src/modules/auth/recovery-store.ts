import { and, asc, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { authRecoveryGrants } from "@/db/schema";
import {
  getRecoveryGrantCleanupCutoff,
  normalizeRecoveryGrantCleanupBatchSize,
} from "./recovery-retention";

export type RecoverySessionState = "matching" | "missing" | "mismatch";

export type RecoveryGrantClaimFailure =
  | "expired"
  | "in-progress"
  | "missing"
  | "password-mismatch"
  | "session-required"
  | "wrong-account"
  | "wrong-session";

export type RecoveryGrantClaimResult =
  | { kind: "execute"; grantId: string }
  | { kind: "already-consumed" }
  | { kind: "rejected"; reason: RecoveryGrantClaimFailure };

export type RecoveryGrantFinalization = "consumed" | "pending" | "failed" | "invalid";

type GrantBinding = {
  jtiHash: string;
  userId: string;
  sessionHash: string;
};

const RECOVERY_ATTEMPT_LEASE_MS = 30_000;

export async function issueRecoveryGrantRecord(
  input: GrantBinding & { expiresAt: Date },
): Promise<void> {
  await db.insert(authRecoveryGrants).values({
    expiresAt: input.expiresAt,
    jtiHash: input.jtiHash,
    sessionHash: input.sessionHash,
    userId: input.userId,
  });

  try {
    await cleanupOldRecoveryGrantRecords();
  } catch {
    // Retention maintenance must never invalidate a newly issued recovery grant.
    console.warn("Recovery grant retention cleanup could not complete.");
  }
}

/**
 * Retains expired grant audit records for 24 hours, then removes a small,
 * index-backed batch. Terminal timestamps are checked separately so a grant
 * that finished recently is retained even if its capability expired earlier.
 */
export async function cleanupOldRecoveryGrantRecords(
  options: { batchSize?: number; now?: Date } = {},
): Promise<number> {
  const batchSize = normalizeRecoveryGrantCleanupBatchSize(options.batchSize);
  const cutoff = getRecoveryGrantCleanupCutoff(options.now ?? new Date());

  return db.transaction(async (transaction) => {
    const candidates = await transaction
      .select({ id: authRecoveryGrants.id })
      .from(authRecoveryGrants)
      .where(
        and(
          lt(authRecoveryGrants.expiresAt, cutoff),
          or(
            and(
              eq(authRecoveryGrants.state, "consumed"),
              lt(authRecoveryGrants.consumedAt, cutoff),
            ),
            and(
              eq(authRecoveryGrants.state, "failed"),
              lt(authRecoveryGrants.failedAt, cutoff),
            ),
            and(
              inArray(authRecoveryGrants.state, ["issued", "pending"]),
              lt(authRecoveryGrants.updatedAt, cutoff),
            ),
          ),
        ),
      )
      .orderBy(asc(authRecoveryGrants.expiresAt))
      .limit(batchSize)
      .for("update", { skipLocked: true });

    if (candidates.length === 0) return 0;

    const deleted = await transaction
      .delete(authRecoveryGrants)
      .where(
        inArray(
          authRecoveryGrants.id,
          candidates.map((candidate) => candidate.id),
        ),
      )
      .returning({ id: authRecoveryGrants.id });

    return deleted.length;
  });
}

/**
 * Claims a durable grant before crossing the non-transactional Supabase Auth
 * boundary. Pending and consumed grants accept only an identical keyed
 * password fingerprint, which makes response-lost retries idempotent without
 * retaining the password itself.
 */
export async function claimRecoveryGrant(
  input: GrantBinding & {
    now: Date;
    passwordFingerprint: string;
    sessionState: RecoverySessionState;
  },
): Promise<RecoveryGrantClaimResult> {
  return db.transaction(async (transaction) => {
    const [grant] = await transaction
      .select()
      .from(authRecoveryGrants)
      .where(eq(authRecoveryGrants.jtiHash, input.jtiHash))
      .for("update");

    const bindingFailure = getBindingFailure(grant, input, input.now);
    if (bindingFailure) return { kind: "rejected", reason: bindingFailure };
    if (!grant) return { kind: "rejected", reason: "missing" };

    if (input.sessionState === "mismatch") {
      return { kind: "rejected", reason: "wrong-session" };
    }

    if (grant.state === "consumed") {
      return grant.passwordFingerprint === input.passwordFingerprint
        ? { kind: "already-consumed" }
        : { kind: "rejected", reason: "password-mismatch" };
    }

    if (grant.state === "pending") {
      if (grant.passwordFingerprint !== input.passwordFingerprint) {
        return { kind: "rejected", reason: "password-mismatch" };
      }

      const leaseExpired =
        grant.updatedAt.getTime() + RECOVERY_ATTEMPT_LEASE_MS <= input.now.getTime();
      if (grant.activeAttempts > 0 && !leaseExpired) {
        return { kind: "rejected", reason: "in-progress" };
      }

      await transaction
        .update(authRecoveryGrants)
        .set({
          activeAttempts: grant.activeAttempts + 1,
          outcomeUncertain: grant.outcomeUncertain || leaseExpired,
          updatedAt: input.now,
        })
        .where(eq(authRecoveryGrants.id, grant.id));
      return { kind: "execute", grantId: grant.id };
    }

    if (input.sessionState !== "matching") {
      return { kind: "rejected", reason: "session-required" };
    }

    await transaction
      .update(authRecoveryGrants)
      .set({
        activeAttempts: 1,
        failedAt: null,
        outcomeUncertain: false,
        passwordFingerprint: input.passwordFingerprint,
        pendingAt: input.now,
        state: "pending",
        updatedAt: input.now,
      })
      .where(eq(authRecoveryGrants.id, grant.id));

    return { kind: "execute", grantId: grant.id };
  });
}

export async function markRecoveryGrantConsumed(
  grantId: string,
  passwordFingerprint: string,
  now: Date,
): Promise<RecoveryGrantFinalization> {
  return db.transaction(async (transaction) => {
    const [grant] = await transaction
      .select()
      .from(authRecoveryGrants)
      .where(eq(authRecoveryGrants.id, grantId))
      .for("update");

    if (!grant || grant.passwordFingerprint !== passwordFingerprint) return "invalid";
    if (grant.state === "consumed") return "consumed";
    if (grant.state !== "pending") return "invalid";

    await transaction
      .update(authRecoveryGrants)
      .set({
        activeAttempts: 0,
        consumedAt: now,
        outcomeUncertain: false,
        state: "consumed",
        updatedAt: now,
      })
      .where(eq(authRecoveryGrants.id, grant.id));
    return "consumed";
  });
}

export async function markRecoveryGrantKnownFailure(
  grantId: string,
  passwordFingerprint: string,
  now: Date,
): Promise<RecoveryGrantFinalization> {
  return db.transaction(async (transaction) => {
    const [grant] = await transaction
      .select()
      .from(authRecoveryGrants)
      .where(eq(authRecoveryGrants.id, grantId))
      .for("update");

    if (!grant || grant.passwordFingerprint !== passwordFingerprint) return "invalid";
    if (grant.state === "consumed") return "consumed";
    if (grant.state !== "pending") return "invalid";

    const activeAttempts = Math.max(0, grant.activeAttempts - 1);
    if (activeAttempts === 0 && !grant.outcomeUncertain) {
      await transaction
        .update(authRecoveryGrants)
        .set({
          activeAttempts: 0,
          failedAt: now,
          outcomeUncertain: false,
          passwordFingerprint: null,
          pendingAt: null,
          state: "failed",
          updatedAt: now,
        })
        .where(eq(authRecoveryGrants.id, grant.id));
      return "failed";
    }

    await transaction
      .update(authRecoveryGrants)
      .set({ activeAttempts, updatedAt: now })
      .where(eq(authRecoveryGrants.id, grant.id));
    return "pending";
  });
}

export async function markRecoveryGrantAmbiguous(
  grantId: string,
  passwordFingerprint: string,
  now: Date,
): Promise<RecoveryGrantFinalization> {
  return db.transaction(async (transaction) => {
    const [grant] = await transaction
      .select()
      .from(authRecoveryGrants)
      .where(eq(authRecoveryGrants.id, grantId))
      .for("update");

    if (!grant || grant.passwordFingerprint !== passwordFingerprint) return "invalid";
    if (grant.state === "consumed") return "consumed";
    if (grant.state !== "pending") return "invalid";

    await transaction
      .update(authRecoveryGrants)
      .set({
        activeAttempts: Math.max(0, grant.activeAttempts - 1),
        outcomeUncertain: true,
        updatedAt: now,
      })
      .where(eq(authRecoveryGrants.id, grant.id));
    return "pending";
  });
}

export async function canRenderRecoveryGrant(
  input: GrantBinding & {
    now: Date;
    sessionState: RecoverySessionState;
  },
): Promise<boolean> {
  const grant = await db.query.authRecoveryGrants.findFirst({
    where: (table, operators) => operators.eq(table.jtiHash, input.jtiHash),
  });
  if (getBindingFailure(grant, input, input.now)) return false;
  if (!grant || grant.state === "consumed") return false;
  if (input.sessionState === "mismatch") return false;
  return grant.state === "pending" || input.sessionState === "matching";
}

function getBindingFailure(
  grant: typeof authRecoveryGrants.$inferSelect | undefined,
  input: GrantBinding,
  now: Date,
): RecoveryGrantClaimFailure | null {
  if (!grant) return "missing";
  if (grant.expiresAt.getTime() <= now.getTime()) return "expired";
  if (grant.userId !== input.userId) return "wrong-account";
  if (grant.sessionHash !== input.sessionHash) return "wrong-session";
  return null;
}
