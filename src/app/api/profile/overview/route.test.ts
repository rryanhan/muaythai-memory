import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfileOverview: vi.fn(),
  requireOnboardedUserId: vi.fn(),
}));

vi.mock("@/modules/auth/current-user", () => ({
  requireOnboardedUserId: mocks.requireOnboardedUserId,
}));
vi.mock("@/modules/auth/http", () => ({
  authenticationErrorResponse: (error: unknown) => (
    error instanceof Error && error.message === "unauthenticated"
      ? NextResponse.json({ error: error.message }, { status: 401 })
      : null
  ),
}));
vi.mock("@/modules/profile/queries", () => ({
  getProfileOverview: mocks.getProfileOverview,
}));

import { GET } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const overview = {
  drillCount: 3,
  favouriteCount: 2,
  drillBackInCount: 1,
  trainingMethods: [{
    id: "22222222-2222-4222-8222-222222222222",
    name: "Pad Work",
    slug: "pad-work",
    iconKey: "pad-work",
    count: 2,
  }],
};

describe("GET /api/profile/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOnboardedUserId.mockResolvedValue(userId);
    mocks.getProfileOverview.mockResolvedValue(overview);
  });

  it("loads only the authenticated user's overview", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ overview });
    expect(mocks.getProfileOverview).toHaveBeenCalledOnce();
    expect(mocks.getProfileOverview).toHaveBeenCalledWith(userId);
  });

  it("does not query profile aggregates when authentication fails", async () => {
    mocks.requireOnboardedUserId.mockRejectedValueOnce(new Error("unauthenticated"));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.getProfileOverview).not.toHaveBeenCalled();
  });

  it("returns 500 when the query result violates the response contract", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getProfileOverview.mockResolvedValueOnce({
      ...overview,
      drillCount: -1,
    });

    try {
      const response = await GET();

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "Profile overview could not be loaded.",
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
