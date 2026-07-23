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

  return {
    AuthenticationRequiredError,
    OnboardingRequiredError,
    createDrill: vi.fn(),
    listDrills: vi.fn(),
    requireOnboardedUserId: vi.fn(),
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
  requireOnboardedUserId: mocks.requireOnboardedUserId,
}));
vi.mock("@/modules/drills/mutations", () => ({
  CreateDrillValidationError: class extends Error {},
  createDrill: mocks.createDrill,
}));
vi.mock("@/modules/drills/queries", () => ({
  listDrills: mocks.listDrills,
}));

import { GET } from "./route";

describe("GET /api/drills onboarding states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listDrills.mockResolvedValue({
      drills: [],
      total: 0,
      filters: {
        keywords: [],
        methodSlugs: [],
        tagSlugs: [],
        statusTagSlugs: [],
        tagMode: "all",
        statusMode: "all",
      },
    });
  });

  it.each([
    {
      error: new mocks.AuthenticationRequiredError(),
      label: "unauthenticated",
      status: 401,
    },
    {
      error: new mocks.OnboardingRequiredError(),
      label: "profile-incomplete",
      status: 403,
    },
    {
      error: new mocks.OnboardingRequiredError(),
      label: "guide-incomplete",
      status: 403,
    },
  ])("rejects a $label user with $status", async ({ error, status }) => {
    mocks.requireOnboardedUserId.mockRejectedValue(error);

    const response = await GET(
      new NextRequest("https://example.test/api/drills"),
    );

    expect(response.status).toBe(status);
    expect(mocks.listDrills).not.toHaveBeenCalled();
  });

  it("allows a fully onboarded user through to the owned drill query", async () => {
    mocks.requireOnboardedUserId.mockResolvedValue(
      "00000000-0000-4000-8000-000000000001",
    );

    const response = await GET(
      new NextRequest("https://example.test/api/drills"),
    );

    expect(response.status).toBe(200);
    expect(mocks.listDrills).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      expect.objectContaining({ tagMode: "all", statusMode: "all" }),
    );
  });
});
