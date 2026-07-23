export type OnboardingState = {
  id: string;
  username: string | null;
  profileOnboardedAt: Date | null;
  firstDrillGuideCompletedAt: Date | null;
  firstDrillGuideSkippedAt: Date | null;
};

type CacheOptions = {
  revalidate: number;
  tags: string[];
};

type CacheResult = <T>(
  loader: () => Promise<T>,
  keyParts: string[],
  options: CacheOptions,
) => () => Promise<T>;

type InvalidateTag = (tag: string, profile: { expire: number }) => void;

const cacheKeyPrefix = "onboarding-state";

export function createOnboardingStateStore({
  read,
  cacheResult,
  invalidateTag,
}: {
  read: (userId: string) => Promise<OnboardingState | null>;
  cacheResult: CacheResult;
  invalidateTag: InvalidateTag;
}) {
  return {
    get(userId: string): Promise<OnboardingState | null> {
      return cacheResult(
        () => read(userId),
        onboardingStateCacheKey(userId),
        {
          revalidate: 60,
          tags: [onboardingStateCacheTag(userId)],
        },
      )();
    },
    invalidate(userId: string): void {
      invalidateTag(onboardingStateCacheTag(userId), { expire: 0 });
    },
  };
}

export function onboardingStateCacheKey(userId: string): string[] {
  return [cacheKeyPrefix, userId];
}

export function onboardingStateCacheTag(userId: string): string {
  return `${cacheKeyPrefix}:${userId}`;
}
