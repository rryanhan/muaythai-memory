import type {
  RecoveryGrantClaimFailure,
  RecoveryGrantClaimResult,
  RecoveryGrantFinalization,
  RecoverySessionState,
} from "./recovery-store";
import {
  fingerprintRecoveryPassword,
  hashRecoveryJti,
  type RecoveryTokenFailure,
  verifyRecoveryGrant,
  verifyRecoveryGrantIdentity,
} from "./recovery-token";

export type RecoveryResetFailure =
  | RecoveryTokenFailure
  | RecoveryGrantClaimFailure
  | "provider-error"
  | "provider-uncertain"
  | "state-error";

export type RecoveryPasswordUpdateResult =
  | { ok: true }
  | { ok: false; certainty: "known" | "ambiguous" };

type RecoveryResetInput = {
  grantToken: string | null | undefined;
  presentedJti: string | null | undefined;
  identity: { userId: string; sessionId: string } | null;
  password: string;
  secret: string;
  now?: Date;
};

type RecoveryResetDependencies = {
  claimGrant: (input: {
    jtiHash: string;
    now: Date;
    passwordFingerprint: string;
    sessionHash: string;
    sessionState: RecoverySessionState;
    userId: string;
  }) => Promise<RecoveryGrantClaimResult>;
  markAmbiguous: (
    grantId: string,
    passwordFingerprint: string,
    now: Date,
  ) => Promise<RecoveryGrantFinalization>;
  markConsumed: (
    grantId: string,
    passwordFingerprint: string,
    now: Date,
  ) => Promise<RecoveryGrantFinalization>;
  markKnownFailure: (
    grantId: string,
    passwordFingerprint: string,
    now: Date,
  ) => Promise<RecoveryGrantFinalization>;
  updatePassword: (userId: string, password: string) => Promise<RecoveryPasswordUpdateResult>;
};

export async function performRecoveryPasswordReset(
  input: RecoveryResetInput,
  dependencies: RecoveryResetDependencies,
): Promise<{ ok: true; idempotent: boolean } | { ok: false; reason: RecoveryResetFailure }> {
  const now = input.now ?? new Date();
  const verification = verifyRecoveryGrant(
    input.grantToken,
    { presentedJti: input.presentedJti },
    { secret: input.secret, now },
  );
  if (!verification.ok) return verification;

  let sessionState: RecoverySessionState = "missing";
  if (input.identity) {
    const identity = verifyRecoveryGrantIdentity(
      verification.claims,
      input.identity,
      input.secret,
    );
    if (!identity.ok) return identity;
    sessionState = "matching";
  }

  const passwordFingerprint = fingerprintRecoveryPassword(
    input.password,
    verification.claims.jti,
    input.secret,
  );
  let claim: RecoveryGrantClaimResult;
  try {
    claim = await dependencies.claimGrant({
      jtiHash: hashRecoveryJti(verification.claims.jti, input.secret),
      now,
      passwordFingerprint,
      sessionHash: verification.claims.sessionHash,
      sessionState,
      userId: verification.claims.sub,
    });
  } catch {
    return { ok: false, reason: "state-error" };
  }

  if (claim.kind === "rejected") {
    return { ok: false, reason: claim.reason };
  }
  if (claim.kind === "already-consumed") {
    return { ok: true, idempotent: true };
  }

  let providerResult: RecoveryPasswordUpdateResult;
  try {
    providerResult = await dependencies.updatePassword(
      verification.claims.sub,
      input.password,
    );
  } catch {
    providerResult = { ok: false, certainty: "ambiguous" };
  }

  if (providerResult.ok) {
    const finalization = await safelyFinalize(() => dependencies.markConsumed(
      claim.grantId,
      passwordFingerprint,
      now,
    ));
    return finalization === "consumed"
      ? { ok: true, idempotent: false }
      : { ok: false, reason: "provider-uncertain" };
  }

  if (providerResult.certainty === "known") {
    const finalization = await safelyFinalize(() => dependencies.markKnownFailure(
      claim.grantId,
      passwordFingerprint,
      now,
    ));
    if (finalization === "consumed") return { ok: true, idempotent: true };
    if (finalization === "pending") {
      return { ok: false, reason: "provider-uncertain" };
    }
    if (finalization === null) return { ok: false, reason: "state-error" };
    return { ok: false, reason: "provider-error" };
  }

  const finalization = await safelyFinalize(() => dependencies.markAmbiguous(
    claim.grantId,
    passwordFingerprint,
    now,
  ));
  return finalization === "consumed"
    ? { ok: true, idempotent: true }
    : { ok: false, reason: "provider-uncertain" };
}

async function safelyFinalize(
  operation: () => Promise<RecoveryGrantFinalization>,
): Promise<RecoveryGrantFinalization | null> {
  try {
    return await operation();
  } catch {
    return null;
  }
}
