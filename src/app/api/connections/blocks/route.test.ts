import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  blockFighter: vi.fn(),
  requireOnboardedUserId: vi.fn(),
}));

vi.mock("@/modules/auth/current-user", () => ({
  requireOnboardedUserId: mocks.requireOnboardedUserId,
}));
vi.mock("@/modules/auth/http", () => ({
  authenticationErrorResponse: () => null,
}));
vi.mock("@/modules/connections/mutations", () => ({
  blockFighter: mocks.blockFighter,
}));

import { POST } from "./route";

const currentUserId = "11111111-1111-4111-8111-111111111111";
const targetUserId = "22222222-2222-4222-8222-222222222222";

describe("POST /api/connections/blocks contract boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireOnboardedUserId.mockResolvedValue(currentUserId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 for malformed JSON without running the mutation", async () => {
    const response = await POST(jsonRequest('{"userId":'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid connection request.",
    });
    expect(mocks.blockFighter).not.toHaveBeenCalled();
  });

  it("returns the generic 500 response when mutation output violates its contract", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.blockFighter.mockResolvedValue({});

    const response = await POST(jsonRequest(JSON.stringify({ userId: targetUserId })));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Fighter could not be blocked.",
    });
    expect(mocks.blockFighter).toHaveBeenCalledWith(currentUserId, targetUserId);
    expect(consoleError).toHaveBeenCalledWith(
      "Fighter could not be blocked.",
      "The server response did not match its contract.",
    );
  });
});

function jsonRequest(body: string): NextRequest {
  return new NextRequest("https://example.test/api/connections/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
