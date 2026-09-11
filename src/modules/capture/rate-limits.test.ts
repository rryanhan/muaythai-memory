import { describe, expect, it, vi } from "vitest";
import { CAPTURE_LIMITS } from "@/config/domain-limits";
import {
  CaptureRateLimitError,
  consumeCaptureRateLimit,
  getCaptureRateLimitPolicies,
  startOfFixedWindow,
} from "./rate-limits";

type ReturnedWindow = { windowKind: string };

describe("capture rate-limit policy", () => {
  it("keeps transcription and cleanup quotas independent", () => {
    expect(getCaptureRateLimitPolicies("transcription")).toEqual([
      {
        kind: "burst",
        limit: CAPTURE_LIMITS.burstAttempts,
        windowMs: CAPTURE_LIMITS.burstWindowMs,
      },
      {
        kind: "daily",
        limit: CAPTURE_LIMITS.transcriptionDailyAttempts,
        windowMs: CAPTURE_LIMITS.dailyWindowMs,
      },
    ]);
    expect(getCaptureRateLimitPolicies("cleanup")[1]?.limit)
      .toBe(CAPTURE_LIMITS.cleanupDailyAttempts);
  });

  it("uses fixed UTC-aligned burst and daily boundaries", () => {
    const now = new Date("2026-08-10T23:59:59.999Z");
    expect(startOfFixedWindow(now, CAPTURE_LIMITS.dailyWindowMs).toISOString())
      .toBe("2026-08-10T00:00:00.000Z");
    expect(startOfFixedWindow(now, CAPTURE_LIMITS.burstWindowMs).toISOString())
      .toBe("2026-08-10T23:50:00.000Z");
    expect(startOfFixedWindow(
      new Date("2026-08-11T00:00:00.000Z"),
      CAPTURE_LIMITS.dailyWindowMs,
    ).toISOString()).toBe("2026-08-11T00:00:00.000Z");
  });
});

describe("consumeCaptureRateLimit", () => {
  const userId = "60000000-0000-4000-8000-000000000001";
  const now = new Date("2026-08-10T12:01:00.000Z");

  it("consumes the burst and daily windows with one insert", async () => {
    const fixture = createDatabase([
      { windowKind: "burst" },
      { windowKind: "daily" },
    ]);

    await consumeCaptureRateLimit(userId, "transcription", {
      now,
      database: fixture.database,
    });

    expect(fixture.transaction).toHaveBeenCalledOnce();
    expect(fixture.insert).toHaveBeenCalledOnce();
    expect(fixture.values).toHaveBeenCalledOnce();
    expect(fixture.values).toHaveBeenCalledWith([
      {
        userId,
        action: "transcription",
        windowKind: "burst",
        windowStart: new Date("2026-08-10T12:00:00.000Z"),
        requestCount: 1,
        updatedAt: now,
      },
      {
        userId,
        action: "transcription",
        windowKind: "daily",
        windowStart: new Date("2026-08-10T00:00:00.000Z"),
        requestCount: 1,
        updatedAt: now,
      },
    ]);
    expect(fixture.onConflictDoUpdate).toHaveBeenCalledOnce();
    expect(fixture.returning).toHaveBeenCalledOnce();
  });

  it("reports the missing daily window with its retry time", async () => {
    const fixture = createDatabase([{ windowKind: "burst" }]);

    const error = await consumeCaptureRateLimit(userId, "cleanup", {
      now,
      database: fixture.database,
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CaptureRateLimitError);
    expect(error).toMatchObject({
      action: "cleanup",
      retryAfterSeconds: 43_140,
      windowKind: "daily",
    });
    expect(fixture.insert).toHaveBeenCalledOnce();
  });

  it("reports burst first when both windows fail", async () => {
    const fixture = createDatabase([]);

    const error = await consumeCaptureRateLimit(userId, "transcription", {
      now,
      database: fixture.database,
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CaptureRateLimitError);
    expect(error).toMatchObject({
      action: "transcription",
      retryAfterSeconds: 540,
      windowKind: "burst",
    });
    expect(fixture.insert).toHaveBeenCalledOnce();
  });
});

function createDatabase(returnedWindows: ReturnedWindow[]) {
  const returning = vi.fn().mockResolvedValue(returnedWindows);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = vi.fn().mockReturnValue({ values });
  const transaction = vi.fn(async (callback: (tx: { insert: typeof insert }) => Promise<void>) => (
    callback({ insert })
  ));

  return {
    database: { transaction } as never,
    insert,
    onConflictDoUpdate,
    returning,
    transaction,
    values,
  };
}
