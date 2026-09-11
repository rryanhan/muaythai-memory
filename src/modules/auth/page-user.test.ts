import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string): never => {
    throw new PageRedirect(destination);
  }),
  requireCurrentAppUser: vi.fn(),
  requireCurrentOnboardingState: vi.fn(),
}));

class PageRedirect extends Error {
  constructor(readonly destination: string) {
    super(`Redirect to ${destination}`);
  }
}

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./current-user", async (importOriginal) => {
  const original = await importOriginal<typeof import("./current-user")>();
  return {
    ...original,
    requireCurrentAppUser: mocks.requireCurrentAppUser,
    requireCurrentOnboardingState: mocks.requireCurrentOnboardingState,
  };
});

import { AuthenticationRequiredError } from "./current-user";
import {
  requireCurrentPageOnboardingState,
  requireCurrentPageUserId,
} from "./page-user";

describe("page onboarding-state authorization", () => {
  const userId = "00000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the already-loaded onboarding state without loading the full user", async () => {
    const state = completeOnboardingState(userId);
    mocks.requireCurrentOnboardingState.mockResolvedValue(state);

    await expect(requireCurrentPageOnboardingState("/connections")).resolves.toBe(state);
    await expect(requireCurrentPageUserId("/connections")).resolves.toBe(userId);

    expect(mocks.requireCurrentAppUser).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated request to sign-in with a sanitized return path", async () => {
    mocks.requireCurrentOnboardingState.mockRejectedValue(new AuthenticationRequiredError());

    await expect(requireCurrentPageOnboardingState("//attacker.example/path"))
      .rejects.toMatchObject({ destination: "/auth/sign-in?next=%2F" });
  });

  it("redirects a profile-incomplete user to profile onboarding", async () => {
    mocks.requireCurrentOnboardingState.mockResolvedValue({
      ...completeOnboardingState(userId),
      username: null,
      profileOnboardedAt: null,
    });

    await expect(requireCurrentPageOnboardingState("/connections?tab=requests"))
      .rejects.toMatchObject({
        destination: "/onboarding/profile?next=%2Fconnections%3Ftab%3Drequests",
      });
  });

  it("redirects a guide-incomplete user to first-drill onboarding", async () => {
    mocks.requireCurrentOnboardingState.mockResolvedValue({
      ...completeOnboardingState(userId),
      firstDrillGuideCompletedAt: null,
    });

    await expect(requireCurrentPageOnboardingState("/connections"))
      .rejects.toMatchObject({
        destination: "/onboarding/first-drill?next=%2Fconnections",
      });
  });
});

function completeOnboardingState(id: string) {
  return {
    id,
    username: "nak_muay",
    profileOnboardedAt: new Date("2026-01-01T00:00:00.000Z"),
    firstDrillGuideCompletedAt: new Date("2026-01-02T00:00:00.000Z"),
    firstDrillGuideSkippedAt: null,
  };
}
