import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeProfileOnboarding: vi.fn(),
  invalidateOnboardingState: vi.fn(),
  requireCurrentAppUser: vi.fn(),
}));

vi.mock("@/modules/auth", () => ({
  authenticationErrorResponse: () => null,
  invalidateOnboardingState: mocks.invalidateOnboardingState,
  requireCurrentAppUser: mocks.requireCurrentAppUser,
}));
vi.mock("@/modules/onboarding/mutations", () => ({
  completeProfileOnboarding: mocks.completeProfileOnboarding,
  OnboardingValidationError: class extends Error {},
}));

import { POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";

describe("POST /api/onboarding/profile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireCurrentAppUser.mockResolvedValue({ id: userId });
    mocks.completeProfileOnboarding.mockResolvedValue("fighter");
  });

  it("invalidates after a successful profile mutation", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.invalidateOnboardingState).toHaveBeenCalledWith(userId);
  });

  it("returns a retryable error when the profile succeeds but invalidation fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.invalidateOnboardingState.mockImplementation(() => {
      throw new Error("cache invalidation failed");
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("1");
    await expect(response.json()).resolves.toEqual({
      error: "Your profile was saved, but onboarding could not be refreshed. Try again.",
    });
    expect(mocks.completeProfileOnboarding).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("invalidates after a post-commit failure without hiding the mutation error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.completeProfileOnboarding.mockRejectedValue(new Error("profile response failed"));
    mocks.invalidateOnboardingState.mockImplementation(() => {
      throw new Error("cache invalidation failed");
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.invalidateOnboardingState).toHaveBeenCalledWith(userId);
    expect(consoleError).toHaveBeenCalledWith(
      "Profile onboarding failed.",
      "profile response failed",
    );
    consoleError.mockRestore();
  });
});

function request(): NextRequest {
  return new NextRequest("https://example.test/api/onboarding/profile", {
    body: JSON.stringify({
      username: "fighter",
      firstName: "",
      lastName: "",
      location: "",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}
