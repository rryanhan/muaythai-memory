import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  getAuthorizedConnectionPage: vi.fn(),
  requireOnboardedUserId: vi.fn(),
}));

vi.mock("@/modules/auth/current-user", () => ({
  requireOnboardedUserId: mocks.requireOnboardedUserId,
}));
vi.mock("@/modules/auth/http", () => ({
  authenticationErrorResponse: () => null,
}));
vi.mock("@/modules/connections/queries", () => ({
  getAuthorizedConnectionPage: mocks.getAuthorizedConnectionPage,
}));

import { GET } from "./route";

const viewerUserId = "11111111-1111-4111-8111-111111111111";

describe("GET /api/fighters/[username]/connections cursor privacy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireOnboardedUserId.mockResolvedValue(viewerUserId);
  });

  it("maps an invalid cursor to 400 after the query confirms access", async () => {
    mocks.getAuthorizedConnectionPage.mockRejectedValue(invalidCursorError());

    const response = await GET(
      request("target_fighter", "?section=followers&cursor=not-a-cursor"),
      context("target_fighter"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid connection request.",
    });
  });

  it("preserves the hidden-owner 404 ahead of an invalid cursor", async () => {
    mocks.getAuthorizedConnectionPage.mockResolvedValue(null);

    const response = await GET(
      request("hidden_fighter", "?section=followers&cursor=not-a-cursor"),
      context("hidden_fighter"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Fighter not found." });
    expect(mocks.getAuthorizedConnectionPage).toHaveBeenCalledWith(
      viewerUserId,
      "hidden_fighter",
      "followers",
      "not-a-cursor",
      20,
    );
  });
});

function request(username: string, search: string): NextRequest {
  return new NextRequest(`https://example.test/api/fighters/${username}/connections${search}`);
}

function context(username: string) {
  return { params: Promise.resolve({ username }) };
}

function invalidCursorError() {
  const result = z.string().refine(() => false, "Invalid connections cursor.")
    .safeParse("not-a-cursor");
  if (result.success) throw new Error("Expected invalid cursor test input.");
  return result.error;
}
