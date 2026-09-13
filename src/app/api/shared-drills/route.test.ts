import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  listSharedDrills: vi.fn(),
  requireOnboardedUserId: vi.fn(),
}));

vi.mock("@/modules/auth/current-user", () => ({
  requireOnboardedUserId: mocks.requireOnboardedUserId,
}));
vi.mock("@/modules/auth/http", () => ({
  authenticationErrorResponse: () => null,
}));
vi.mock("@/modules/sharing/queries", () => ({
  listSharedDrills: mocks.listSharedDrills,
}));

import { GET } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";

describe("GET /api/shared-drills cursor contracts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireOnboardedUserId.mockResolvedValue(userId);
  });

  it("maps an invalid shared-drill cursor from the query boundary to 400", async () => {
    mocks.listSharedDrills.mockRejectedValue(invalidCursorError());

    const response = await GET(request("?cursor=not-a-cursor"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid drill sharing request.",
      issues: [expect.objectContaining({ message: "Invalid shared-drill cursor." })],
    });
    expect(mocks.listSharedDrills).toHaveBeenCalledWith(userId, "not-a-cursor", undefined);
  });
});

function request(search: string): NextRequest {
  return new NextRequest(`https://example.test/api/shared-drills${search}`);
}

function invalidCursorError() {
  const result = z.string().refine(() => false, "Invalid shared-drill cursor.")
    .safeParse("not-a-cursor");
  if (result.success) throw new Error("Expected invalid cursor test input.");
  return result.error;
}
