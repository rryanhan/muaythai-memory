import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  getConnectionSectionPage: vi.fn(),
  getConnectionsSummary: vi.fn(),
  requireOnboardedUserId: vi.fn(),
}));

vi.mock("@/modules/auth/current-user", () => ({
  requireOnboardedUserId: mocks.requireOnboardedUserId,
}));
vi.mock("@/modules/auth/http", () => ({
  authenticationErrorResponse: () => null,
}));
vi.mock("@/modules/connections/queries", () => ({
  getConnectionSectionPage: mocks.getConnectionSectionPage,
  getConnectionsSummary: mocks.getConnectionsSummary,
}));

import { GET } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";

describe("GET /api/connections cursor contracts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireOnboardedUserId.mockResolvedValue(userId);
  });

  it("maps an invalid section cursor from the query boundary to 400", async () => {
    mocks.getConnectionSectionPage.mockRejectedValue(invalidCursorError());

    const response = await GET(request("?section=followers&cursor=not-a-cursor"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid connection request.",
      issues: [expect.objectContaining({ message: "Invalid connections cursor." })],
    });
    expect(mocks.getConnectionSectionPage).toHaveBeenCalledWith(
      userId,
      "followers",
      "not-a-cursor",
      20,
    );
  });
});

function request(search: string): NextRequest {
  return new NextRequest(`https://example.test/api/connections${search}`);
}

function invalidCursorError() {
  const result = z.string().refine(() => false, "Invalid connections cursor.")
    .safeParse("not-a-cursor");
  if (result.success) throw new Error("Expected invalid cursor test input.");
  return result.error;
}
