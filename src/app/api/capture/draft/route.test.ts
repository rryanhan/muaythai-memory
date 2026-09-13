import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateCaptureDraft: vi.fn(),
  requireProfileOnboardedUserId: vi.fn(),
}));

vi.mock("@/modules/auth/current-user", () => ({
  requireProfileOnboardedUserId: mocks.requireProfileOnboardedUserId,
}));
vi.mock("@/modules/auth/http", () => ({
  authenticationErrorResponse: (error: unknown) => (
    error instanceof Error && error.message === "unauthenticated"
      ? NextResponse.json({ error: error.message }, { status: 401 })
      : null
  ),
}));
vi.mock("@/modules/capture/draft", () => ({
  generateCaptureDraft: mocks.generateCaptureDraft,
}));

import { CaptureRateLimitError } from "@/modules/capture/rate-limits";
import { POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";

describe("POST /api/capture/draft hardening", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireProfileOnboardedUserId.mockResolvedValue(userId);
  });

  it("rejects malformed input before dispatching cleanup", async () => {
    const response = await POST(request({ transcript: "too short" }));

    expect(response.status).toBe(400);
    expect(mocks.generateCaptureDraft).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON before dispatching cleanup", async () => {
    const response = await POST(rawRequest("{not-json"));

    expect(response.status).toBe(400);
    expect(mocks.generateCaptureDraft).not.toHaveBeenCalled();
  });

  it("returns 500 when generated output violates the response contract", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.generateCaptureDraft.mockResolvedValue({ draft: null, warnings: [] });

    try {
      const response = await POST(request({
        transcript: "On pads, throw a jab and cross before finishing with a kick.",
      }));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "Failed to generate capture draft.",
      });
      expect(mocks.generateCaptureDraft).toHaveBeenCalledOnce();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("returns Retry-After for a blocked cleanup", async () => {
    mocks.generateCaptureDraft.mockRejectedValue(new CaptureRateLimitError({
      action: "cleanup",
      windowKind: "burst",
      retryAfterSeconds: 321,
    }));

    const response = await POST(request({
      transcript: "On pads, throw a jab and cross before finishing with a kick.",
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("321");
    await expect(response.json()).resolves.toMatchObject({ retryAfterSeconds: 321 });
  });
});

function request(body: unknown): NextRequest {
  return rawRequest(JSON.stringify(body));
}

function rawRequest(body: string): NextRequest {
  return new NextRequest("https://example.test/api/capture/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
