import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidateOnboardingState: vi.fn(),
  requireCurrentAppUser: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("@/modules/auth/current-user", () => ({
  requireCurrentAppUser: mocks.requireCurrentAppUser,
}));
vi.mock("@/modules/auth/http", () => ({
  authenticationErrorResponse: (error: unknown) => (
    error instanceof Error && error.message === "unauthenticated"
      ? NextResponse.json({ error: error.message }, { status: 401 })
      : null
  ),
}));
vi.mock("@/modules/auth/onboarding-state", () => ({
  invalidateOnboardingState: mocks.invalidateOnboardingState,
}));
vi.mock("@/modules/profile/avatar", () => ({
  AvatarValidationError: class extends Error {},
}));
vi.mock("@/modules/profile/contracts", () => ({
  profileResponseSchema: { parse: (value: unknown) => value },
}));
vi.mock("@/modules/profile/mutations", () => ({
  ProfileUpdateError: class extends Error {
    readonly status = 400;
  },
  updateProfile: mocks.updateProfile,
}));

import { PATCH } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";

describe("PATCH /api/profile cache coherence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireCurrentAppUser.mockResolvedValue({
      id: userId,
      email: "fighter@example.com",
    });
    mocks.updateProfile.mockResolvedValue({
      id: userId,
      username: "new_name",
      displayName: "new_name",
      email: "fighter@example.com",
    });
  });

  it("invalidates cached onboarding state after a successful profile update", async () => {
    const response = await PATCH(profileRequest());

    expect(response.status).toBe(200);
    expect(mocks.invalidateOnboardingState).toHaveBeenCalledOnce();
    expect(mocks.invalidateOnboardingState).toHaveBeenCalledWith(userId);
  });

  it("does not invalidate when request fields fail validation", async () => {
    const formData = validProfileFormData();
    formData.delete("location");

    const response = await PATCH(profileRequest(formData));

    expect(response.status).toBe(400);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(mocks.invalidateOnboardingState).not.toHaveBeenCalled();
  });

  it("returns a retryable response when a saved profile cannot be invalidated", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.invalidateOnboardingState.mockImplementation(() => {
      throw new Error("cache unavailable");
    });

    const response = await PATCH(profileRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("1");
    await expect(response.json()).resolves.toEqual({
      error: "Your profile was saved, but the app could not refresh it. Try again.",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Profile state invalidation failed after update.",
      "cache unavailable",
    );
    consoleError.mockRestore();
  });
});

function validProfileFormData(): FormData {
  const formData = new FormData();
  formData.set("username", "new_name");
  formData.set("firstName", "");
  formData.set("lastName", "");
  formData.set("location", "");
  formData.set("removeAvatar", "false");
  return formData;
}

function profileRequest(formData = validProfileFormData()): NextRequest {
  return {
    formData: async () => formData,
  } as NextRequest;
}
