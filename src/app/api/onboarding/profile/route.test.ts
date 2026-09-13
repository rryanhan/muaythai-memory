import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeProfileOnboarding: vi.fn(),
  invalidateOnboardingState: vi.fn(),
  requireCurrentAppUser: vi.fn(),
}));

vi.mock("@/modules/auth/current-user", () => ({
  requireCurrentAppUser: mocks.requireCurrentAppUser,
}));
vi.mock("@/modules/auth/http", () => ({
  authenticationErrorResponse: () => null,
}));
vi.mock("@/modules/auth/onboarding-state", () => ({
  invalidateOnboardingState: mocks.invalidateOnboardingState,
}));
vi.mock("@/modules/onboarding/mutations", () => ({
  completeProfileOnboarding: mocks.completeProfileOnboarding,
  OnboardingValidationError: class extends Error {},
}));

import { POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const validProfile = {
  username: "fighter",
  firstName: "",
  lastName: "",
  location: "",
};

describe("POST /api/onboarding/profile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireCurrentAppUser.mockResolvedValue({ id: userId });
    mocks.completeProfileOnboarding.mockResolvedValue("fighter");
  });

  it("invalidates after a successful profile mutation", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.completeProfileOnboarding).toHaveBeenCalledWith(
      { id: userId },
      validProfile,
    );
    expect(mocks.invalidateOnboardingState).toHaveBeenCalledWith(userId);
  });

  it("returns 400 for malformed JSON without attempting the mutation", async () => {
    const response = await POST(rawRequest("{not-json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Enter valid profile details.",
    });
    expect(mocks.completeProfileOnboarding).not.toHaveBeenCalled();
    expect(mocks.invalidateOnboardingState).not.toHaveBeenCalled();
  });

  it("preserves field-level feedback for schema-invalid profile details", async () => {
    const response = await POST(request({
      ...validProfile,
      username: "ab",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Username must be at least 3 characters.",
    });
    expect(mocks.completeProfileOnboarding).not.toHaveBeenCalled();
    expect(mocks.invalidateOnboardingState).not.toHaveBeenCalled();
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

  it("invalidates once when the saved profile violates the response contract", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.completeProfileOnboarding.mockResolvedValue(undefined);

    try {
      const response = await POST(request());

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "Profile could not be saved. Try again.",
      });
      expect(mocks.completeProfileOnboarding).toHaveBeenCalledTimes(1);
      expect(mocks.invalidateOnboardingState).toHaveBeenCalledOnce();
      expect(mocks.invalidateOnboardingState).toHaveBeenCalledWith(userId);
    } finally {
      consoleError.mockRestore();
    }
  });
});

function request(body: unknown = validProfile): NextRequest {
  return rawRequest(JSON.stringify(body));
}

function rawRequest(body: string): NextRequest {
  return new NextRequest("https://example.test/api/onboarding/profile", {
    body,
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}
