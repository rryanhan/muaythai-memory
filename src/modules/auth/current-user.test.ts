import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  getCachedOnboardingState: vi.fn(),
  getClaims: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(callback: T) => callback,
}));
vi.mock("@/db/client", () => ({
  db: {
    insert: mocks.insert,
    query: { users: { findFirst: mocks.findFirst } },
  },
}));
vi.mock("@/db/schema", () => ({ users: { id: "id" } }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getClaims: mocks.getClaims },
  })),
}));
vi.mock("./onboarding-state", () => ({
  getCachedOnboardingState: mocks.getCachedOnboardingState,
}));

import { OnboardingRequiredError, requireOnboardedUserId } from "./current-user";

describe("requireOnboardedUserId", () => {
  const userId = "00000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: userId } },
      error: null,
    });
  });

  it("returns the cached onboarding identity without loading the full app user", async () => {
    mocks.getCachedOnboardingState.mockResolvedValue(completeOnboardingState(userId));

    await expect(requireOnboardedUserId()).resolves.toBe(userId);

    expect(mocks.getCachedOnboardingState).toHaveBeenCalledWith(userId);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("preserves the onboarding gate without loading the full app user", async () => {
    mocks.getCachedOnboardingState.mockResolvedValue({
      ...completeOnboardingState(userId),
      firstDrillGuideCompletedAt: null,
    });

    await expect(requireOnboardedUserId()).rejects.toBeInstanceOf(OnboardingRequiredError);

    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("keeps the first-request app-user synchronization fallback", async () => {
    mocks.getCachedOnboardingState.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue({
      id: userId,
      displayName: "Nak Muay",
      username: "nak_muay",
      firstName: null,
      lastName: null,
      location: null,
      avatarUrl: null,
      profileOnboardedAt: new Date("2026-01-01T00:00:00.000Z"),
      firstDrillGuideCompletedAt: new Date("2026-01-02T00:00:00.000Z"),
      firstDrillGuideSkippedAt: null,
    });

    await expect(requireOnboardedUserId()).resolves.toBe(userId);

    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.insert).not.toHaveBeenCalled();
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
