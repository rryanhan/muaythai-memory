import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class JournalMutationError extends Error {
    readonly status = 400;
  }

  return {
    createJournalUploadIntent: vi.fn(),
    JournalMutationError,
    requireOnboardedUserId: vi.fn(),
  };
});

vi.mock("@/modules/auth/current-user", () => ({
  requireOnboardedUserId: mocks.requireOnboardedUserId,
}));
vi.mock("@/modules/auth/http", () => ({
  authenticationErrorResponse: () => null,
}));
vi.mock("@/modules/journal/mutations", () => ({
  createJournalUploadIntent: mocks.createJournalUploadIntent,
  JournalMutationError: mocks.JournalMutationError,
}));

import { POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";

describe("POST /api/journal/uploads contract boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireOnboardedUserId.mockResolvedValue(userId);
  });

  it("returns 400 for malformed JSON without attempting the mutation", async () => {
    const response = await POST(jsonRequest('{"fileName":'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid journal request." });
    expect(mocks.createJournalUploadIntent).not.toHaveBeenCalled();
  });

  it("returns a logged generic 500 when mutation output violates the response contract", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createJournalUploadIntent.mockResolvedValue({
      entryId: "not-a-uuid",
      upload: {
        endpoint: "https://storage.example.test/upload",
        path: "user/entry/video.webm",
        token: "upload-token",
      },
    });

    const response = await POST(jsonRequest(JSON.stringify(validInput)));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Journal upload could not be started.",
    });
    expect(mocks.createJournalUploadIntent).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      "Journal upload could not be started.",
      "The server response did not match its contract.",
    );
    consoleError.mockRestore();
  });
});

const validInput = {
  fileName: "training.webm",
  mimeType: "video/webm",
  sizeBytes: 1_024,
  durationMs: 30_000,
  occurredOn: "2026-09-13",
  caption: "Pad rounds",
  drillId: null,
};

function jsonRequest(body: string): NextRequest {
  return new NextRequest("https://example.test/api/journal/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
