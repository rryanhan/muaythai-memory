import { describe, expect, it, vi } from "vitest";
import {
  createOnboardingStateStore,
  onboardingStateCacheKey,
  onboardingStateCacheTag,
  type OnboardingState,
} from "./onboarding-state-cache";

describe("onboarding state cache", () => {
  it("isolates two users and reads through immediately after profile, save, and skip invalidation", async () => {
    const userA = "00000000-0000-4000-8000-000000000001";
    const userB = "00000000-0000-4000-8000-000000000002";
    const states = new Map<string, OnboardingState>([
      [userA, state(userA)],
      [userB, {
        ...state(userB),
        username: "fighter_b",
        profileOnboardedAt: new Date("2026-07-23T00:00:00.000Z"),
      }],
    ]);
    const reads = vi.fn(async (userId: string) => {
      const current = states.get(userId);
      return current ? { ...current } : null;
    });
    const memoryCache = createMemoryCache();
    const store = createOnboardingStateStore({
      read: reads,
      cacheResult: memoryCache.cacheResult,
      invalidateTag: memoryCache.invalidateTag,
    });

    expect(await store.get(userA)).toMatchObject({ username: null });
    expect(await store.get(userB)).toMatchObject({ username: "fighter_b" });
    expect(reads).toHaveBeenCalledTimes(2);

    states.set(userA, {
      ...states.get(userA)!,
      username: "fighter_a",
      profileOnboardedAt: new Date("2026-07-23T01:00:00.000Z"),
    });
    expect(await store.get(userA)).toMatchObject({ username: null });
    store.invalidate(userA);
    expect(await store.get(userA)).toMatchObject({ username: "fighter_a" });
    expect(await store.get(userB)).toMatchObject({ username: "fighter_b" });
    expect(reads).toHaveBeenCalledTimes(3);

    states.set(userA, {
      ...states.get(userA)!,
      firstDrillGuideCompletedAt: new Date("2026-07-23T02:00:00.000Z"),
    });
    store.invalidate(userA);
    expect(await store.get(userA)).toMatchObject({
      firstDrillGuideCompletedAt: new Date("2026-07-23T02:00:00.000Z"),
    });
    expect(await store.get(userB)).toMatchObject({
      firstDrillGuideCompletedAt: null,
      firstDrillGuideSkippedAt: null,
    });
    expect(reads).toHaveBeenCalledTimes(4);

    states.set(userB, {
      ...states.get(userB)!,
      firstDrillGuideSkippedAt: new Date("2026-07-23T03:00:00.000Z"),
    });
    store.invalidate(userB);
    expect(await store.get(userB)).toMatchObject({
      firstDrillGuideCompletedAt: null,
      firstDrillGuideSkippedAt: new Date("2026-07-23T03:00:00.000Z"),
    });
    expect(await store.get(userA)).toMatchObject({
      firstDrillGuideCompletedAt: new Date("2026-07-23T02:00:00.000Z"),
      firstDrillGuideSkippedAt: null,
    });
    expect(reads).toHaveBeenCalledTimes(5);

    expect(memoryCache.keys).toEqual(new Set([
      JSON.stringify(onboardingStateCacheKey(userA)),
      JSON.stringify(onboardingStateCacheKey(userB)),
    ]));
    expect(memoryCache.invalidatedTags).toEqual([
      onboardingStateCacheTag(userA),
      onboardingStateCacheTag(userA),
      onboardingStateCacheTag(userB),
    ]);
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

function createMemoryCache() {
  const entries = new Map<string, { tags: string[]; value: Promise<unknown> }>();
  const keys = new Set<string>();
  const invalidatedTags: string[] = [];

  return {
    keys,
    invalidatedTags,
    cacheResult<T>(
      loader: () => Promise<T>,
      keyParts: string[],
      options: { revalidate: number; tags: string[] },
    ): () => Promise<T> {
      const key = JSON.stringify(keyParts);
      keys.add(key);
      return () => {
        const existing = entries.get(key);
        if (existing) return existing.value as Promise<T>;
        const value = loader();
        entries.set(key, { tags: options.tags, value });
        return value;
      };
    },
    invalidateTag(tag: string): void {
      invalidatedTags.push(tag);
      for (const [key, entry] of entries) {
        if (entry.tags.includes(tag)) entries.delete(key);
      }
    },
  };
}
