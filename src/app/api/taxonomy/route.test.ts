import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTaxonomy: vi.fn(),
  requireCurrentUserId: vi.fn(),
}));

vi.mock("@/modules/auth/current-user", () => ({
  requireCurrentUserId: mocks.requireCurrentUserId,
}));
vi.mock("@/modules/auth/http", () => ({
  authenticationErrorResponse: (error: unknown) => (
    error instanceof Error && error.message === "unauthenticated"
      ? NextResponse.json({ error: error.message }, { status: 401 })
      : null
  ),
}));
vi.mock("@/modules/taxonomy/queries", () => ({
  getTaxonomy: mocks.getTaxonomy,
}));

import { GET } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const taxonomy = {
  trainingMethods: [],
  tagCategories: [],
  standardTags: [],
  customTags: [],
  statusTags: [],
};

describe("GET /api/taxonomy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireCurrentUserId.mockResolvedValue(userId);
    mocks.getTaxonomy.mockResolvedValue(taxonomy);
  });

  it("returns validated taxonomy for the authenticated user", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(taxonomy);
    expect(mocks.getTaxonomy).toHaveBeenCalledWith(userId);
  });

  it("returns the generic 500 when the query result violates the response contract", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getTaxonomy.mockResolvedValue({
      ...taxonomy,
      trainingMethods: null,
    });

    try {
      const response = await GET();

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "Failed to load taxonomy." });
    } finally {
      consoleError.mockRestore();
    }
  });
});
