import { cache } from "react";
import { eq } from "drizzle-orm";
import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import {
  createOnboardingStateStore,
  type OnboardingState,
} from "./onboarding-state-cache";

export {
  createOnboardingStateStore,
  onboardingStateCacheKey,
  onboardingStateCacheTag,
  type OnboardingState,
} from "./onboarding-state-cache";

const onboardingStateStore = createOnboardingStateStore({
  read: readOnboardingState,
  cacheResult: (loader, keyParts, options) => unstable_cache(loader, keyParts, options),
  invalidateTag: revalidateTag,
});

export const getCachedOnboardingState = cache(onboardingStateStore.get);

export function invalidateOnboardingState(userId: string): void {
  onboardingStateStore.invalidate(userId);
}

async function readOnboardingState(userId: string): Promise<OnboardingState | null> {
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
}
