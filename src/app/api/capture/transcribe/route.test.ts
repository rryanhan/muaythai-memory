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

  it("returns 400 when multipart parsing rejects the request", async () => {
    const response = await POST(formDataFailureRequest(new TypeError("invalid multipart body")));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "The audio upload could not be read.",
    });
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

  it("does not mislabel a downstream TypeError as an invalid upload", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.transcribeCaptureAudio.mockRejectedValue(new TypeError("provider bug"));

    try {
      const response = await POST(audioRequest());

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "Failed to transcribe the recording.",
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("returns 500 when the transcript violates the response contract", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.transcribeCaptureAudio.mockResolvedValue("   ");

    try {
      const response = await POST(audioRequest());

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "Failed to transcribe the recording.",
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});

function audioRequest(): NextRequest {
  const formData = new FormData();
  formData.set("audio", new File(["audio"], "memo.webm", { type: "audio/webm" }));
  return formRequest(formData);
}

function formRequest(formData: FormData): NextRequest {
  return {
    formData: async () => formData,
    signal: new AbortController().signal,
  } as NextRequest;
}

function formDataFailureRequest(error: Error): NextRequest {
  return {
    formData: async () => {
      throw error;
    },
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}
