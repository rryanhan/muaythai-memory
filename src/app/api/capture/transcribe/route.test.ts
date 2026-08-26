import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class CaptureRateLimitError extends Error {
    readonly status = 429;
    readonly retryAfterSeconds: number;

    constructor(retryAfterSeconds: number) {
      super("Too many voice transcription attempts. Wait a few minutes and try again.");
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }

  return {
    CaptureRateLimitError,
    consumeCaptureRateLimit: vi.fn(),
    getCaptureTranscriptionProvider: vi.fn(),
    requireProfileOnboardedUserId: vi.fn(),
    transcribeCaptureAudio: vi.fn(),
    validateCaptureAudioMetadata: vi.fn(),
  };
});

vi.mock("@/modules/auth", () => ({
  authenticationErrorResponse: (error: unknown) => (
    error instanceof Error && error.message === "unauthenticated"
      ? NextResponse.json({ error: error.message }, { status: 401 })
      : null
  ),
  requireProfileOnboardedUserId: mocks.requireProfileOnboardedUserId,
}));
vi.mock("@/modules/capture/rate-limits", () => ({
  CaptureRateLimitError: mocks.CaptureRateLimitError,
  consumeCaptureRateLimit: mocks.consumeCaptureRateLimit,
}));
vi.mock("@/modules/capture/transcription", () => ({
  getCaptureTranscriptionProvider: mocks.getCaptureTranscriptionProvider,
  validateCaptureAudioMetadata: mocks.validateCaptureAudioMetadata,
}));

import { CaptureTranscriptionError } from "@/modules/capture/errors";
import { POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";

describe("POST /api/capture/transcribe hardening", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireProfileOnboardedUserId.mockResolvedValue(userId);
    mocks.consumeCaptureRateLimit.mockResolvedValue(undefined);
    mocks.transcribeCaptureAudio.mockResolvedValue("Throw a jab and cross on pads.");
    mocks.getCaptureTranscriptionProvider.mockReturnValue({
      transcribe: mocks.transcribeCaptureAudio,
    });
  });

  it("rejects malformed uploads without consuming quota", async () => {
    const response = await POST(formRequest(new FormData()));

    expect(response.status).toBe(400);
    expect(mocks.consumeCaptureRateLimit).not.toHaveBeenCalled();
    expect(mocks.transcribeCaptureAudio).not.toHaveBeenCalled();
  });

  it("validates audio before consuming quota", async () => {
    const audio = new File(["audio"], "memo.webm", { type: "audio/webm" });
    const formData = new FormData();
    formData.set("audio", audio);

    await POST(formRequest(formData));

    expect(mocks.validateCaptureAudioMetadata.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.getCaptureTranscriptionProvider.mock.invocationCallOrder[0]);
    expect(mocks.getCaptureTranscriptionProvider.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.consumeCaptureRateLimit.mock.invocationCallOrder[0]);
  });

  it("does not consume quota when provider configuration is invalid", async () => {
    mocks.getCaptureTranscriptionProvider.mockImplementation(() => {
      throw new CaptureTranscriptionError("provider configuration invalid", 503);
    });
    const audio = new File(["audio"], "memo.webm", { type: "audio/webm" });
    const formData = new FormData();
    formData.set("audio", audio);

    const response = await POST(formRequest(formData));

    expect(response.status).toBe(503);
    expect(mocks.consumeCaptureRateLimit).not.toHaveBeenCalled();
    expect(mocks.transcribeCaptureAudio).not.toHaveBeenCalled();
  });

  it("returns Retry-After and never dispatches after quota rejection", async () => {
    mocks.consumeCaptureRateLimit.mockRejectedValue(new mocks.CaptureRateLimitError(77));
    const audio = new File(["audio"], "memo.webm", { type: "audio/webm" });
    const formData = new FormData();
    formData.set("audio", audio);

    const response = await POST(formRequest(formData));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("77");
    expect(mocks.transcribeCaptureAudio).not.toHaveBeenCalled();
  });
});

function formRequest(formData: FormData): NextRequest {
  return {
    formData: async () => formData,
    signal: new AbortController().signal,
  } as NextRequest;
}
