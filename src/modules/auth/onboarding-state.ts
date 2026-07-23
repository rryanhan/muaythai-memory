import { cache } from "react";
import { eq } from "drizzle-orm";
import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "@/db/client";
import { users } from "@/db/schema";

export type OnboardingState = {
  id: string;
  username: string | null;
  profileOnboardedAt: Date | null;
  firstDrillGuideCompletedAt: Date | null;
  firstDrillGuideSkippedAt: Date | null;
};

const cacheKeyPrefix = "onboarding-state";

export const getCachedOnboardingState = cache(async (userId: string): Promise<OnboardingState | null> => {
  return unstable_cache(
    async () => {
      const [state] = await db
        .select({
          id: users.id,
          username: users.username,
          profileOnboardedAt: users.profileOnboardedAt,
          firstDrillGuideCompletedAt: users.firstDrillGuideCompletedAt,
          firstDrillGuideSkippedAt: users.firstDrillGuideSkippedAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return state ?? null;
    },
    [cacheKeyPrefix, userId],
    {
      revalidate: 60,
      tags: [onboardingStateTag(userId)],
    },
  )();
});

export function invalidateOnboardingState(userId: string): void {
  revalidateTag(onboardingStateTag(userId), { expire: 0 });
}

function onboardingStateTag(userId: string): string {
  return `${cacheKeyPrefix}:${userId}`;
}
