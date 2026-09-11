import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const getClaims = vi.fn();
  return {
    createSupabaseServerClient: vi.fn(async () => ({ auth: { getClaims } })),
    findFirst: vi.fn(),
    getCachedOnboardingState: vi.fn(),
    getClaims,
    insert: vi.fn(),
  };
});

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
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("./onboarding-state", () => ({
  getCachedOnboardingState: mocks.getCachedOnboardingState,
}));

import {
  OnboardingRequiredError,
  requireOnboardedUserId,
  synchronizeAppUserFromVerifiedAuthUser,
} from "./current-user";

describe("synchronizeAppUserFromVerifiedAuthUser", () => {
  const userId = "00000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the verified identity without constructing a client or reading claims again", async () => {
    mocks.findFirst.mockResolvedValue(appUserRow(userId));

    await expect(synchronizeAppUserFromVerifiedAuthUser({
      email: "fighter@example.com",
      id: userId,
      user_metadata: { full_name: "Somchai Jaidee" },
    })).resolves.toMatchObject({
      email: "fighter@example.com",
      firstName: "Somchai",
      id: userId,
      lastName: "Jaidee",
    });

    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.getClaims).not.toHaveBeenCalled();
    expect(mocks.findFirst).toHaveBeenCalledOnce();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("inserts a missing app user from the verified identity", async () => {
    const insertedUser = {
      ...appUserRow(userId),
      displayName: "Somchai Jaidee",
    };
    const returning = vi.fn().mockResolvedValue([insertedUser]);
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    mocks.findFirst.mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values });

    await expect(synchronizeAppUserFromVerifiedAuthUser({
      email: "fighter@example.com",
      id: userId,
      user_metadata: { full_name: "Somchai Jaidee" },
    })).resolves.toMatchObject({
      displayName: "Somchai Jaidee",
      id: userId,
    });

    expect(values).toHaveBeenCalledWith({
      displayName: "Somchai Jaidee",
      id: userId,
    });
    expect(onConflictDoNothing).toHaveBeenCalledWith({ target: "id" });
    expect(mocks.findFirst).toHaveBeenCalledOnce();
  });

  it("loads the conflict winner when another request inserts first", async () => {
    const racedUser = appUserRow(userId);
    const returning = vi.fn().mockResolvedValue([]);
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    mocks.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(racedUser);
    mocks.insert.mockReturnValue({ values });

    await expect(synchronizeAppUserFromVerifiedAuthUser({
      email: "fighter@example.com",
      id: userId,
      user_metadata: {},
    })).resolves.toMatchObject({
      displayName: "Nak Muay",
      id: userId,
    });

    expect(mocks.findFirst).toHaveBeenCalledTimes(2);
    expect(returning).toHaveBeenCalledOnce();
  });
});

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

function appUserRow(id: string) {
  return {
    avatarUrl: null,
    displayName: "Nak Muay",
    firstDrillGuideCompletedAt: null,
    firstDrillGuideSkippedAt: null,
    firstName: null,
    id,
    lastName: null,
    location: null,
    profileOnboardedAt: null,
    username: null,
  };
}
