import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOnboardedUserId: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/modules/auth/current-user", () => ({
  requireOnboardedUserId: mocks.requireOnboardedUserId,
}));
vi.mock("@/modules/auth/http", () => ({
  authenticationErrorResponse: () => null,
}));

vi.mock("@/db/client", () => ({
  db: { select: mocks.select },
}));

import { GET } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";

describe("GET /api/journal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireOnboardedUserId.mockResolvedValue(userId);
  });

  it("rejects a semantically invalid cursor before querying PostgreSQL", async () => {
    const cursor = Buffer.from(JSON.stringify({
      occurredOn: "0000-01-01",
      createdAt: "2026-08-10T12:00:00.000Z",
      id: "22222222-2222-4222-8222-222222222222",
    })).toString("base64url");
    const request = new NextRequest(
      `https://example.test/api/journal?cursor=${encodeURIComponent(cursor)}`,
    );

    const response = await GET(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid journal cursor.",
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
