import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidateOnboardingState: vi.fn(),
  requireProfileOnboardedUserId: vi.fn(),
  skipFirstDrillGuide: vi.fn(),
}));

vi.mock("@/modules/auth", () => ({
  authenticationErrorResponse: () => null,
  invalidateOnboardingState: mocks.invalidateOnboardingState,
  requireProfileOnboardedUserId: mocks.requireProfileOnboardedUserId,
}));
vi.mock("@/modules/onboarding/mutations", () => ({
  skipFirstDrillGuide: mocks.skipFirstDrillGuide,
}));

import { POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";

describe("POST /api/onboarding/skip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProfileOnboardedUserId.mockResolvedValue(userId);
    mocks.skipFirstDrillGuide.mockResolvedValue(true);
  });

  it("invalidates after a successful skip mutation", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.invalidateOnboardingState).toHaveBeenCalledWith(userId);
  });

  it("invalidates after a post-commit failure without hiding the mutation error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.skipFirstDrillGuide.mockRejectedValue(new Error("skip response failed"));
    mocks.invalidateOnboardingState.mockImplementation(() => {
      throw new Error("cache invalidation failed");
    });

    const response = await POST();

    expect(response.status).toBe(500);
    expect(mocks.invalidateOnboardingState).toHaveBeenCalledWith(userId);
    expect(consoleError).toHaveBeenCalledWith(
      "Onboarding skip failed.",
      "skip response failed",
    );
    consoleError.mockRestore();
  });
});
