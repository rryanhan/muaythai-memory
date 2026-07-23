import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class AuthenticationRequiredError extends Error {
    readonly status = 401;

    constructor() {
      super("Authentication required.");
    }
  }

  class OnboardingRequiredError extends Error {
    readonly status = 403;

    constructor() {
      super("Complete onboarding before using this part of the app.");
    }
  }

  class CreateDrillIdempotencyError extends Error {
    readonly status = 409;

    constructor() {
      super("This Idempotency-Key was already used for a different drill.");
    }
  }

  return {
    AuthenticationRequiredError,
    CreateDrillIdempotencyError,
    OnboardingRequiredError,
    createGuidedFirstDrill: vi.fn(),
    invalidateOnboardingState: vi.fn(),
    requireProfileOnboardedUserId: vi.fn(),
  };
});

vi.mock("@/modules/auth", () => ({
  AuthenticationRequiredError: mocks.AuthenticationRequiredError,
  OnboardingRequiredError: mocks.OnboardingRequiredError,
  authenticationErrorResponse: (error: unknown) => {
    if (
      error instanceof mocks.AuthenticationRequiredError
      || error instanceof mocks.OnboardingRequiredError
    ) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return null;
  },
  invalidateOnboardingState: mocks.invalidateOnboardingState,
  requireProfileOnboardedUserId: mocks.requireProfileOnboardedUserId,
}));
vi.mock("@/modules/drills/mutations", () => ({
  CreateDrillIdempotencyError: mocks.CreateDrillIdempotencyError,
  CreateDrillValidationError: class extends Error {},
}));
vi.mock("@/modules/onboarding/mutations", () => ({
  createGuidedFirstDrill: mocks.createGuidedFirstDrill,
}));

import { POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const creationKey = "00000000-0000-4000-8000-000000000002";
const input = {
  title: "First drill",
  summary: "",
  notes: null,
  steps: ["Slip outside."],
  trainingMethodSlugs: ["pad-work"],
  tagSlugs: [],
  statusTagSlugs: [],
};
const drill = {
  id: "00000000-0000-4000-8000-000000000003",
  title: input.title,
  summary: "",
  notes: null,
  steps: [
    {
      id: "00000000-0000-4000-8000-000000000004",
      position: 1,
      body: input.steps[0],
    },
  ],
  trainingMethods: [
    {
      id: "00000000-0000-4000-8000-000000000005",
      name: "Pad Work",
      slug: "pad-work",
      iconKey: "pad-work",
      sortOrder: 1,
    },
  ],
  tags: [],
  customTags: [],
  statusTags: [],
  createdAt: new Date("2026-07-23T00:00:00.000Z"),
  updatedAt: new Date("2026-07-23T00:00:00.000Z"),
};

describe("POST /api/onboarding/first-drill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProfileOnboardedUserId.mockResolvedValue(userId);
    mocks.createGuidedFirstDrill.mockResolvedValue(drill);
  });

  it("returns 401 for an unauthenticated request", async () => {
    mocks.requireProfileOnboardedUserId.mockRejectedValue(
      new mocks.AuthenticationRequiredError(),
    );

    const response = await POST(request(input, creationKey));

    expect(response.status).toBe(401);
  });

  it("returns 403 while the profile is incomplete", async () => {
    mocks.requireProfileOnboardedUserId.mockRejectedValue(
      new mocks.OnboardingRequiredError(),
    );

    const response = await POST(request(input, creationKey));

    expect(response.status).toBe(403);
  });

  it("allows a guide-incomplete user and binds the validated creation key", async () => {
    const response = await POST(request(input, creationKey));

    expect(response.status).toBe(200);
    expect(mocks.createGuidedFirstDrill).toHaveBeenCalledWith(
      userId,
      input,
      creationKey,
    );
    expect(mocks.invalidateOnboardingState).toHaveBeenCalledWith(userId);
  });

  it("allows a fully onboarded user to replay the guide", async () => {
    const response = await POST(request(input, creationKey));

    expect(response.status).toBe(200);
    expect(mocks.createGuidedFirstDrill).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing or malformed key before creating a drill", async () => {
    const missing = await POST(request(input));
    const malformed = await POST(request(input, "not-a-uuid"));

    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(mocks.createGuidedFirstDrill).not.toHaveBeenCalled();
  });

  it("returns 409 when a key is reused with a different payload", async () => {
    mocks.createGuidedFirstDrill.mockRejectedValue(
      new mocks.CreateDrillIdempotencyError(),
    );

    const response = await POST(request(input, creationKey));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This Idempotency-Key was already used for a different drill.",
    });
  });
});

function request(body: unknown, idempotencyKey?: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);

  return new NextRequest("https://example.test/api/onboarding/first-drill", {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
}
