import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1;
const INTENT_TTL_SECONDS = 60 * 60;
const GRANT_TTL_SECONDS = 10 * 60;

type RecoveryIntentClaims = {
  v: typeof TOKEN_VERSION;
  purpose: "recovery-intent";
  emailHash: string;
  stateHash: string;
  iat: number;
  exp: number;
};

export type RecoveryGrantClaims = {
  v: typeof TOKEN_VERSION;
  purpose: "password-recovery";
  sub: string;
  sessionHash: string;
  jti: string;
  iat: number;
  exp: number;
};

export type RecoveryGrantArtifact = {
  token: string;
  jti: string;
  jtiHash: string;
  sessionHash: string;
  expiresAt: Date;
};

export type RecoveryTokenFailure =
  | "expired"
  | "invalid"
  | "missing"
  | "wrong-account"
  | "wrong-grant"
  | "wrong-session";

export type RecoveryTokenResult<T> =
  | { ok: true; claims: T }
  | { ok: false; reason: RecoveryTokenFailure };

type TokenOptions = {
  secret: string;
  now?: Date;
};

export function createRecoveryIntent(
  email: string,
  options: TokenOptions,
): { state: string; token: string } {
  const now = epochSeconds(options.now);
  const state = randomBytes(24).toString("base64url");
  const claims: RecoveryIntentClaims = {
    v: TOKEN_VERSION,
    purpose: "recovery-intent",
    emailHash: bindValue("email", normalizeEmail(email), options.secret),
    stateHash: bindValue("state", state, options.secret),
    iat: now,
    exp: now + INTENT_TTL_SECONDS,
  };

  return { state, token: signClaims(claims, options.secret) };
}

export function verifyRecoveryIntent(
  token: string | null | undefined,
  input: { email: string; state: string },
  options: TokenOptions,
): RecoveryTokenResult<RecoveryIntentClaims> {
  const result = verifyClaims(token, "recovery-intent", options);
  if (!result.ok) return result;

  const expectedEmail = bindValue("email", normalizeEmail(input.email), options.secret);
  const expectedState = bindValue("state", input.state, options.secret);
  if (!safeStringEqual(result.claims.emailHash, expectedEmail)) {
    return { ok: false, reason: "wrong-account" };
  }
  if (!safeStringEqual(result.claims.stateHash, expectedState)) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, claims: result.claims };
}

export function createRecoveryGrant(
  input: {
    userId: string;
    sessionId: string;
  },
  options: TokenOptions,
): RecoveryGrantArtifact {
  const now = epochSeconds(options.now);
  const jti = randomBytes(24).toString("base64url");
  const sessionHash = hashRecoverySession(input.sessionId, options.secret);
  const claims: RecoveryGrantClaims = {
    v: TOKEN_VERSION,
    purpose: "password-recovery",
    sub: input.userId,
    sessionHash,
    jti,
    iat: now,
    exp: now + GRANT_TTL_SECONDS,
  };

  return {
    token: signClaims(claims, options.secret),
    jti,
    jtiHash: hashRecoveryJti(jti, options.secret),
    sessionHash,
    expiresAt: new Date(claims.exp * 1_000),
  };
}

export function verifyRecoveryGrant(
  token: string | null | undefined,
  input: { presentedJti?: string | null } | undefined,
  options: TokenOptions,
): RecoveryTokenResult<RecoveryGrantClaims> {
  const result = verifyClaims(token, "password-recovery", options);
  if (!result.ok) return result;

  if (
    input?.presentedJti !== undefined &&
    input.presentedJti !== null &&
    !safeStringEqual(result.claims.jti, input.presentedJti)
  ) {
    return { ok: false, reason: "wrong-grant" };
  }

  return { ok: true, claims: result.claims };
}

export function verifyRecoveryGrantIdentity(
  claims: RecoveryGrantClaims,
  input: { userId: string; sessionId: string },
  secret: string,
): { ok: true } | { ok: false; reason: "wrong-account" | "wrong-session" } {
  if (!safeStringEqual(claims.sub, input.userId)) {
    return { ok: false, reason: "wrong-account" };
  }
  if (!safeStringEqual(claims.sessionHash, hashRecoverySession(input.sessionId, secret))) {
    return { ok: false, reason: "wrong-session" };
  }
  return { ok: true };
}

export function hashRecoveryJti(jti: string, secret: string): string {
  return bindHexValue("recovery-jti", jti, secret);
}

export function hashRecoverySession(sessionId: string, secret: string): string {
  return bindHexValue("recovery-session", sessionId, secret);
}

export function fingerprintRecoveryPassword(
  password: string,
  grantJti: string,
  secret: string,
): string {
  return bindHexValue("recovery-password", `${grantJti}\0${password}`, secret);
}

export function getAuthFlowSecret(): string {
  const secret = process.env.AUTH_FLOW_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("AUTH_FLOW_SECRET must contain at least 32 bytes.");
  }
  return secret;
}

function signClaims(claims: RecoveryIntentClaims | RecoveryGrantClaims, secret: string): string {
  assertSecret(secret);
  const encodedClaims = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createSignature(encodedClaims, secret).toString("base64url");
  return `${encodedClaims}.${signature}`;
}

function verifyClaims(
  token: string | null | undefined,
  expectedPurpose: "recovery-intent",
  options: TokenOptions,
): RecoveryTokenResult<RecoveryIntentClaims>;
function verifyClaims(
  token: string | null | undefined,
  expectedPurpose: "password-recovery",
  options: TokenOptions,
): RecoveryTokenResult<RecoveryGrantClaims>;
function verifyClaims(
  token: string | null | undefined,
  expectedPurpose: RecoveryIntentClaims["purpose"] | RecoveryGrantClaims["purpose"],
  options: TokenOptions,
): RecoveryTokenResult<RecoveryIntentClaims | RecoveryGrantClaims> {
  if (!token) return { ok: false, reason: "missing" };
  assertSecret(options.secret);

  const segments = token.split(".");
  if (segments.length !== 2) return { ok: false, reason: "invalid" };
  const [encodedClaims, encodedSignature] = segments;
  if (!encodedClaims || !encodedSignature) return { ok: false, reason: "invalid" };

  let suppliedSignature: Buffer;
  let claims: unknown;
  try {
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
    claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const expectedSignature = createSignature(encodedClaims, options.secret);
  if (!safeBufferEqual(suppliedSignature, expectedSignature)) {
    return { ok: false, reason: "invalid" };
  }

  if (!isClaimsForPurpose(claims, expectedPurpose)) {
    return { ok: false, reason: "invalid" };
  }

  if (claims.exp <= epochSeconds(options.now)) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, claims };
}

function isClaimsForPurpose(
  value: unknown,
  purpose: RecoveryIntentClaims["purpose"] | RecoveryGrantClaims["purpose"],
): value is RecoveryIntentClaims | RecoveryGrantClaims {
  if (!isRecord(value)) return false;
  if (
    value.v !== TOKEN_VERSION ||
    value.purpose !== purpose ||
    !isInteger(value.iat) ||
    !isInteger(value.exp) ||
    value.exp <= value.iat
  ) {
    return false;
  }

  if (purpose === "recovery-intent") {
    return typeof value.emailHash === "string" && typeof value.stateHash === "string";
  }

  return (
    typeof value.sub === "string" &&
    typeof value.sessionHash === "string" &&
    value.sessionHash.length === 64 &&
    typeof value.jti === "string" &&
    value.jti.length >= 24
  );
}

function createSignature(encodedClaims: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(encodedClaims).digest();
}

function bindValue(namespace: string, value: string, secret: string): string {
  return createHmac("sha256", secret).update(`${namespace}\0${value}`).digest("base64url");
}

function bindHexValue(namespace: string, value: string, secret: string): string {
  assertSecret(secret);
  return createHmac("sha256", secret).update(`${namespace}\0${value}`).digest("hex");
}

function safeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return safeBufferEqual(leftBuffer, rightBuffer);
}

function safeBufferEqual(supplied: Buffer, expected: Buffer): boolean {
  const comparable = Buffer.alloc(expected.length);
  supplied.copy(comparable, 0, 0, Math.min(supplied.length, comparable.length));
  const contentsMatch = timingSafeEqual(comparable, expected);
  return supplied.length === expected.length && contentsMatch;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function epochSeconds(date = new Date()): number {
  return Math.floor(date.getTime() / 1000);
}

function assertSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Recovery token secrets must contain at least 32 bytes.");
  }
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
