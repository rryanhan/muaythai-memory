import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingState } from "./onboarding-state-cache";

const mocks = vi.hoisted(() => {
  type CacheEntry = {
    tags: string[];
    value: unknown;
  };

  const sourceStates = new Map<string, OnboardingState>();
  const cacheEntries = new Map<string, CacheEntry>();
  const readUserIds: string[] = [];
  const requireCurrentAppUser = vi.fn();
  const requireProfileOnboardedUserId = vi.fn();
  const completeProfileOnboarding = vi.fn();
  const createGuidedFirstDrill = vi.fn();
  const skipFirstDrillGuide = vi.fn();
  let invalidateDelegate: ((userId: string) => void) | null = null;

  class OnboardingValidationError extends Error {
    readonly status = 400;
  }

  class CreateDrillIdempotencyError extends Error {
    readonly status = 409;
  }

  class CreateDrillValidationError extends Error {}

  const unstableCache = vi.fn((
    loader: () => Promise<unknown>,
    keyParts: string[],
    options: { revalidate: number; tags: string[] },
  ) => {
    const key = JSON.stringify(keyParts);
    return async () => {
      const cached = cacheEntries.get(key);
      if (cached) return cached.value;
      const value = await loader();
      cacheEntries.set(key, { tags: options.tags, value });
      return value;
    };
  });

  const revalidateTag = vi.fn((tag: string) => {
    for (const [key, entry] of cacheEntries) {
      if (entry.tags.includes(tag)) cacheEntries.delete(key);
    }
  });

  const select = vi.fn(() => ({
    from: () => ({
      where: (userId: string) => ({
        limit: async () => {
          readUserIds.push(userId);
          const current = sourceStates.get(userId);
          return current ? [{ ...current }] : [];
        },
      }),
    }),
  }));

  return {
    cacheEntries,
    completeProfileOnboarding,
    createGuidedFirstDrill,
    CreateDrillIdempotencyError,
    CreateDrillValidationError,
    get invalidateDelegate() {
      return invalidateDelegate;
    },
    set invalidateDelegate(delegate: ((userId: string) => void) | null) {
      invalidateDelegate = delegate;
    },
    OnboardingValidationError,
    readUserIds,
    revalidateTag,
    requireCurrentAppUser,
    requireProfileOnboardedUserId,
    select,
    skipFirstDrillGuide,
    sourceStates,
    unstableCache,
  };
});

vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(callback: T) => callback,
}));
vi.mock("drizzle-orm", () => ({
  eq: (_column: unknown, value: string) => value,
}));
vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
  unstable_cache: mocks.unstableCache,
}));
vi.mock("@/db/client", () => ({
  db: { select: mocks.select },
}));
vi.mock("@/db/schema", () => ({
  users: {
    id: "id",
    username: "username",
    profileOnboardedAt: "profileOnboardedAt",
    firstDrillGuideCompletedAt: "firstDrillGuideCompletedAt",
    firstDrillGuideSkippedAt: "firstDrillGuideSkippedAt",
  },
}));
vi.mock("@/modules/auth", () => ({
  authenticationErrorResponse: () => null,
  invalidateOnboardingState: (userId: string) => mocks.invalidateDelegate?.(userId),
  requireCurrentAppUser: mocks.requireCurrentAppUser,
  requireProfileOnboardedUserId: mocks.requireProfileOnboardedUserId,
}));
vi.mock("@/modules/drills/mutations", () => ({
  CreateDrillIdempotencyError: mocks.CreateDrillIdempotencyError,
  CreateDrillValidationError: mocks.CreateDrillValidationError,
}));
vi.mock("@/modules/onboarding/mutations", () => ({
  completeProfileOnboarding: mocks.completeProfileOnboarding,
  createGuidedFirstDrill: mocks.createGuidedFirstDrill,
  OnboardingValidationError: mocks.OnboardingValidationError,
  skipFirstDrillGuide: mocks.skipFirstDrillGuide,
}));

import {
  getCachedOnboardingState,
  invalidateOnboardingState,
  onboardingStateCacheKey,
  onboardingStateCacheTag,
} from "./onboarding-state";
import { POST as completeProfile } from "@/app/api/onboarding/profile/route";
import { POST as completeFirstDrill } from "@/app/api/onboarding/first-drill/route";
import { POST as skipFirstDrill } from "@/app/api/onboarding/skip/route";

describe("production onboarding state cache adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheEntries.clear();
    mocks.readUserIds.length = 0;
    mocks.sourceStates.clear();
    mocks.completeProfileOnboarding.mockReset();
    mocks.createGuidedFirstDrill.mockReset();
    mocks.requireCurrentAppUser.mockReset();
    mocks.requireProfileOnboardedUserId.mockReset();
    mocks.skipFirstDrillGuide.mockReset();
    mocks.invalidateDelegate = invalidateOnboardingState;
  });

  it("isolates two users and reads through profile, completion, and skip invalidations", async () => {
    const userA = "00000000-0000-4000-8000-000000000001";
    const userB = "00000000-0000-4000-8000-000000000002";
    mocks.sourceStates.set(userA, state(userA));
    mocks.sourceStates.set(userB, {
      ...state(userB),
      username: "fighter_b",
      profileOnboardedAt: new Date("2026-07-23T00:00:00.000Z"),
    });

    expect(await getCachedOnboardingState(userA)).toMatchObject({ username: null });
    expect(await getCachedOnboardingState(userB)).toMatchObject({ username: "fighter_b" });
    expect(mocks.readUserIds).toEqual([userA, userB]);

    mocks.sourceStates.set(userA, {
      ...mocks.sourceStates.get(userA)!,
      username: "fighter_a",
      profileOnboardedAt: new Date("2026-07-23T01:00:00.000Z"),
    });
    expect(await getCachedOnboardingState(userA)).toMatchObject({ username: null });
    invalidateOnboardingState(userA);
    expect(await getCachedOnboardingState(userA)).toMatchObject({ username: "fighter_a" });
    expect(await getCachedOnboardingState(userB)).toMatchObject({ username: "fighter_b" });
    expect(mocks.readUserIds).toEqual([userA, userB, userA]);

    mocks.sourceStates.set(userA, {
      ...mocks.sourceStates.get(userA)!,
      firstDrillGuideCompletedAt: new Date("2026-07-23T02:00:00.000Z"),
    });
    invalidateOnboardingState(userA);
    expect(await getCachedOnboardingState(userA)).toMatchObject({
      firstDrillGuideCompletedAt: new Date("2026-07-23T02:00:00.000Z"),
      firstDrillGuideSkippedAt: null,
    });
    expect(await getCachedOnboardingState(userB)).toMatchObject({
      firstDrillGuideCompletedAt: null,
      firstDrillGuideSkippedAt: null,
    });
    expect(mocks.readUserIds).toEqual([userA, userB, userA, userA]);

    mocks.sourceStates.set(userB, {
      ...mocks.sourceStates.get(userB)!,
      firstDrillGuideSkippedAt: new Date("2026-07-23T03:00:00.000Z"),
    });
    invalidateOnboardingState(userB);
    expect(await getCachedOnboardingState(userB)).toMatchObject({
      firstDrillGuideCompletedAt: null,
      firstDrillGuideSkippedAt: new Date("2026-07-23T03:00:00.000Z"),
    });
    expect(await getCachedOnboardingState(userA)).toMatchObject({
      firstDrillGuideCompletedAt: new Date("2026-07-23T02:00:00.000Z"),
      firstDrillGuideSkippedAt: null,
    });
    expect(mocks.readUserIds).toEqual([userA, userB, userA, userA, userB]);

    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      onboardingStateCacheKey(userA),
      {
        revalidate: 60,
        tags: [onboardingStateCacheTag(userA)],
      },
    );
    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      onboardingStateCacheKey(userB),
      {
        revalidate: 60,
        tags: [onboardingStateCacheTag(userB)],
      },
    );
    expect(mocks.revalidateTag.mock.calls).toEqual([
      [onboardingStateCacheTag(userA), { expire: 0 }],
      [onboardingStateCacheTag(userA), { expire: 0 }],
      [onboardingStateCacheTag(userB), { expire: 0 }],
    ]);
  });

  it("reads fresh state after authenticated profile, completion, and skip routes", async () => {
    const userA = "00000000-0000-4000-8000-000000000011";
    const userB = "00000000-0000-4000-8000-000000000012";
    mocks.sourceStates.set(userA, state(userA));
    mocks.sourceStates.set(userB, {
      ...state(userB),
      username: "fighter_b",
      profileOnboardedAt: new Date("2026-07-23T00:00:00.000Z"),
    });
    await getCachedOnboardingState(userA);
    await getCachedOnboardingState(userB);

    mocks.requireCurrentAppUser.mockResolvedValue({ id: userA });
    mocks.completeProfileOnboarding.mockImplementation(async () => {
      mocks.sourceStates.set(userA, {
        ...mocks.sourceStates.get(userA)!,
        username: "fighter_a",
        profileOnboardedAt: new Date("2026-07-23T01:00:00.000Z"),
      });
      return "fighter_a";
    });
    expect((await completeProfile(profileRequest())).status).toBe(200);
    expect(await getCachedOnboardingState(userA)).toMatchObject({ username: "fighter_a" });
    expect(mocks.readUserIds).toEqual([userA, userB, userA]);

    mocks.requireProfileOnboardedUserId.mockResolvedValueOnce(userA);
    mocks.createGuidedFirstDrill.mockImplementation(async () => {
      mocks.sourceStates.set(userA, {
        ...mocks.sourceStates.get(userA)!,
        firstDrillGuideCompletedAt: new Date("2026-07-23T02:00:00.000Z"),
        firstDrillGuideSkippedAt: null,
      });
      return drillDetail();
    });
    expect((await completeFirstDrill(firstDrillRequest())).status).toBe(200);
    expect(await getCachedOnboardingState(userA)).toMatchObject({
      firstDrillGuideCompletedAt: new Date("2026-07-23T02:00:00.000Z"),
    });
    expect(await getCachedOnboardingState(userB)).toMatchObject({
      firstDrillGuideSkippedAt: null,
    });
    expect(mocks.readUserIds).toEqual([userA, userB, userA, userA]);

    mocks.requireProfileOnboardedUserId.mockResolvedValueOnce(userB);
    mocks.skipFirstDrillGuide.mockImplementation(async () => {
      mocks.sourceStates.set(userB, {
        ...mocks.sourceStates.get(userB)!,
        firstDrillGuideCompletedAt: null,
        firstDrillGuideSkippedAt: new Date("2026-07-23T03:00:00.000Z"),
      });
      return true;
    });
    expect((await skipFirstDrill()).status).toBe(200);
    expect(await getCachedOnboardingState(userB)).toMatchObject({
      firstDrillGuideSkippedAt: new Date("2026-07-23T03:00:00.000Z"),
    });
    expect(await getCachedOnboardingState(userA)).toMatchObject({
      firstDrillGuideCompletedAt: new Date("2026-07-23T02:00:00.000Z"),
    });
    expect(mocks.readUserIds).toEqual([userA, userB, userA, userA, userB]);
  });
});

function state(id: string): OnboardingState {
  return {
    id,
    username: null,
    profileOnboardedAt: null,
    firstDrillGuideCompletedAt: null,
    firstDrillGuideSkippedAt: null,
  };
}

function profileRequest(): NextRequest {
  return new NextRequest("https://example.test/api/onboarding/profile", {
    body: JSON.stringify({
      username: "fighter_a",
      firstName: "",
      lastName: "",
      location: "",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function firstDrillRequest(): NextRequest {
  return new NextRequest("https://example.test/api/onboarding/first-drill", {
    body: JSON.stringify({
      title: "First drill",
      summary: "",
      notes: null,
      steps: ["Slip outside."],
      trainingMethodSlugs: ["pad-work"],
      tagSlugs: [],
      statusTagSlugs: [],
    }),
    headers: {
      "content-type": "application/json",
      "idempotency-key": "00000000-0000-4000-8000-000000000013",
    },
    method: "POST",
  });
}

function drillDetail() {
  return {
    id: "00000000-0000-4000-8000-000000000014",
    title: "First drill",
    summary: "",
    notes: null,
    steps: [{
      id: "00000000-0000-4000-8000-000000000015",
      position: 1,
      body: "Slip outside.",
    }],
    trainingMethods: [{
      id: "00000000-0000-4000-8000-000000000016",
      name: "Pad Work",
      slug: "pad-work",
      iconKey: "pad-work",
      sortOrder: 1,
    }],
    tags: [],
    customTags: [],
    statusTags: [],
    createdAt: new Date("2026-07-23T00:00:00.000Z"),
    updatedAt: new Date("2026-07-23T00:00:00.000Z"),
  };
}
