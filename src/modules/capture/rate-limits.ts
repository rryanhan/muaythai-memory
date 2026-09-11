import { sql } from "drizzle-orm";
import { CAPTURE_LIMITS } from "@/config/domain-limits";
import { db } from "@/db/client";
import { captureRateLimits } from "@/db/schema";

export type CaptureRateLimitAction = "transcription" | "cleanup";
export type CaptureRateLimitWindow = "burst" | "daily";

type CaptureRateLimitDatabase = Pick<typeof db, "transaction">;

type CaptureRateLimitPolicy = {
  kind: CaptureRateLimitWindow;
  limit: number;
  windowMs: number;
};

export class CaptureRateLimitError extends Error {
  readonly status = 429;
  readonly retryAfterSeconds: number;
  readonly action: CaptureRateLimitAction;
  readonly windowKind: CaptureRateLimitWindow;

  constructor(params: {
    action: CaptureRateLimitAction;
    windowKind: CaptureRateLimitWindow;
    retryAfterSeconds: number;
  }) {
    super(rateLimitMessage(params.action, params.windowKind));
    this.name = "CaptureRateLimitError";
    this.action = params.action;
    this.windowKind = params.windowKind;
    this.retryAfterSeconds = params.retryAfterSeconds;
  }
}

export async function consumeCaptureRateLimit(
  userId: string,
  action: CaptureRateLimitAction,
  options: { now?: Date; database?: CaptureRateLimitDatabase } = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const database = options.database ?? db;
  const policies = getPolicies(action);

  await database.transaction(async (tx) => {
    const windows = policies.map((policy) => ({
      policy,
      windowStart: startOfFixedWindow(now, policy.windowMs),
    }));
    const burstPolicy = policies.find((policy) => policy.kind === "burst");
    const dailyPolicy = policies.find((policy) => policy.kind === "daily");

    if (!burstPolicy || !dailyPolicy) {
      throw new Error(`Capture rate-limit policy is incomplete for ${action}.`);
    }

    const rows = await tx
      .insert(captureRateLimits)
      .values(windows.map(({ policy, windowStart }) => ({
        userId,
        action,
        windowKind: policy.kind,
        windowStart,
        requestCount: 1,
        updatedAt: now,
      })))
      .onConflictDoUpdate({
        target: [
          captureRateLimits.userId,
          captureRateLimits.action,
          captureRateLimits.windowKind,
          captureRateLimits.windowStart,
        ],
        set: {
          requestCount: sql`${captureRateLimits.requestCount} + 1`,
          updatedAt: now,
        },
        setWhere: sql`${captureRateLimits.requestCount} < case ${captureRateLimits.windowKind}
          when 'burst' then ${burstPolicy.limit}
          when 'daily' then ${dailyPolicy.limit}
          else 0
        end`,
      })
      .returning({ windowKind: captureRateLimits.windowKind });

    const consumedWindowKinds = new Set(rows.map((row) => row.windowKind));
    const failedWindow = windows.find(({ policy }) => !consumedWindowKinds.has(policy.kind));

    if (failedWindow) {
      throw new CaptureRateLimitError({
        action,
        windowKind: failedWindow.policy.kind,
        retryAfterSeconds: retryAfterSeconds(
          now,
          failedWindow.windowStart,
          failedWindow.policy.windowMs,
        ),
      });
    }
  });
}

export function getCaptureRateLimitPolicies(
  action: CaptureRateLimitAction,
): readonly CaptureRateLimitPolicy[] {
  return getPolicies(action);
}

export function startOfFixedWindow(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

function getPolicies(action: CaptureRateLimitAction): readonly CaptureRateLimitPolicy[] {
  return [
    {
      kind: "burst",
      limit: CAPTURE_LIMITS.burstAttempts,
      windowMs: CAPTURE_LIMITS.burstWindowMs,
    },
    {
      kind: "daily",
      limit: action === "transcription"
        ? CAPTURE_LIMITS.transcriptionDailyAttempts
        : CAPTURE_LIMITS.cleanupDailyAttempts,
      windowMs: CAPTURE_LIMITS.dailyWindowMs,
    },
  ];
}

function retryAfterSeconds(now: Date, windowStart: Date, windowMs: number): number {
  return Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1_000));
}

function rateLimitMessage(
  action: CaptureRateLimitAction,
  windowKind: CaptureRateLimitWindow,
): string {
  if (windowKind === "burst") {
    return action === "transcription"
      ? "Too many voice transcription attempts. Wait a few minutes and try again."
      : "Too many drill cleanup attempts. Wait a few minutes and try again.";
  }

  return action === "transcription"
    ? "Today’s Voice Memo transcription limit has been reached. Try again after the daily reset."
    : "Today’s drill cleanup limit has been reached. Try again after the daily reset.";
}
