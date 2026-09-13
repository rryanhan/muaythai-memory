import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMuayThaiGraph: vi.fn(),
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
vi.mock("@/modules/graph/queries", () => ({
  getMuayThaiGraph: mocks.getMuayThaiGraph,
}));

import { GET } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const graph = {
  nodes: [],
  edges: [],
  filters: {
    keywords: [],
    methodSlugs: [],
    tagSlugs: [],
    statusTagSlugs: [],
    tagMode: "all",
    statusMode: "all",
  },
  options: {
    showTags: false,
    showCustomTags: false,
    showStatusTags: false,
  },
};

describe("GET /api/graph", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireOnboardedUserId.mockResolvedValue(userId);
    mocks.getMuayThaiGraph.mockResolvedValue(graph);
  });

  it("maps invalid query parameters to the existing 400 response", async () => {
    const response = await GET(request("?tagMode=invalid"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid graph request.",
    });
    expect(mocks.getMuayThaiGraph).not.toHaveBeenCalled();
  });

  it("returns 500 when the query result violates the response contract", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getMuayThaiGraph.mockResolvedValue({
      ...graph,
      nodes: [{ invalid: true }],
    });

    try {
      const response = await GET(request());

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "Failed to load graph." });
    } finally {
      consoleError.mockRestore();
    }
  });
});

function request(search = ""): NextRequest {
  return new NextRequest(`https://example.test/api/graph${search}`);
}
