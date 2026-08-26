import { describe, expect, it } from "vitest";
import { CAPTURE_LIMITS } from "@/config/domain-limits";
import {
  getCaptureRateLimitPolicies,
  startOfFixedWindow,
} from "./rate-limits";

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
