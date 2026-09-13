import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DrillShareError } from "@/modules/sharing/errors";

const mocks = vi.hoisted(() => ({
  getDrillShareRecipientPage: vi.fn(),
  requireOnboardedUserId: vi.fn(),
  updateDrillShare: vi.fn(),
}));

vi.mock("@/modules/auth/current-user", () => ({
  requireOnboardedUserId: mocks.requireOnboardedUserId,
}));
vi.mock("@/modules/auth/http", () => ({
  authenticationErrorResponse: () => null,
}));
vi.mock("@/modules/sharing/mutations", () => ({
  updateDrillShare: mocks.updateDrillShare,
}));
vi.mock("@/modules/sharing/queries", () => ({
  getDrillShareRecipientPage: mocks.getDrillShareRecipientPage,
}));

import { GET, PATCH } from "./route";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const drillId = "22222222-2222-4222-8222-222222222222";
const recipientUserId = "33333333-3333-4333-8333-333333333333";
const context = { params: Promise.resolve({ id: drillId }) };

describe("PATCH /api/drills/[id]/shares contract boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireOnboardedUserId.mockResolvedValue(ownerUserId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 for malformed JSON without running the mutation", async () => {
    const response = await PATCH(jsonRequest('{"recipientUserId":'), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid drill sharing request.",
    });
    expect(mocks.updateDrillShare).not.toHaveBeenCalled();
  });

  it("returns the generic 500 response when mutation output violates its contract", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.updateDrillShare.mockResolvedValue({});

    const response = await PATCH(jsonRequest(JSON.stringify({
      recipientUserId,
      shared: true,
    })), context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Drill sharing could not be updated.",
    });
    expect(mocks.updateDrillShare).toHaveBeenCalledWith(
      ownerUserId,
      drillId,
      recipientUserId,
      true,
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Drill sharing could not be updated.",
      "The server response did not match its contract.",
    );
  });
});

describe("GET /api/drills/[id]/shares cursor privacy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireOnboardedUserId.mockResolvedValue(ownerUserId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps an invalid cursor to 400 after the query confirms ownership", async () => {
    mocks.getDrillShareRecipientPage.mockRejectedValue(invalidCursorError());

    const response = await GET(cursorRequest(), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid drill sharing request.",
    });
  });

  it("preserves the unowned-drill 404 ahead of an invalid cursor", async () => {
    mocks.getDrillShareRecipientPage.mockRejectedValue(
      new DrillShareError("Drill not found.", 404),
    );

    const response = await GET(cursorRequest(), context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Drill not found." });
    expect(mocks.getDrillShareRecipientPage).toHaveBeenCalledWith(
      ownerUserId,
      drillId,
      "not-a-cursor",
    );
  });
});

function jsonRequest(body: string): NextRequest {
  return new NextRequest(`https://example.test/api/drills/${drillId}/shares`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

function cursorRequest(): NextRequest {
  return new NextRequest(
    `https://example.test/api/drills/${drillId}/shares?cursor=not-a-cursor`,
  );
}

function invalidCursorError() {
  const result = z.string().refine(() => false, "Invalid connections cursor.")
    .safeParse("not-a-cursor");
  if (result.success) throw new Error("Expected invalid cursor test input.");
  return result.error;
}
