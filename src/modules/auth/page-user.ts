import { redirect } from "next/navigation";
import { safeInternalPath } from "@/lib/safe-internal-path";
import {
  AuthenticationRequiredError,
  getOnboardingPath,
  isProfileOnboarded,
  requireCurrentAppUser,
} from "./current-user";

export async function requireCurrentPageUser(nextPath = "/") {
  try {
    const user = await requireCurrentAppUser();
    const onboardingPath = getOnboardingPath(user, safeInternalPath(nextPath));
    if (onboardingPath) redirect(onboardingPath);
    return user;
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error;
    redirect(`/auth/sign-in?next=${encodeURIComponent(safeInternalPath(nextPath))}`);
  }
}

export async function requireCurrentPageUserId(nextPath = "/") {
  try {
    const user = await requireCurrentAppUser();
    const onboardingPath = getOnboardingPath(user, safeInternalPath(nextPath));
    if (onboardingPath) redirect(onboardingPath);
    return user.id;
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error;
    redirect(`/auth/sign-in?next=${encodeURIComponent(safeInternalPath(nextPath))}`);
  }
}

export async function requireAuthenticatedPageUser(nextPath = "/") {
  try {
    return await requireCurrentAppUser();
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error;
    redirect(`/auth/sign-in?next=${encodeURIComponent(safeInternalPath(nextPath))}`);
  }
}

export async function requireProfileOnboardedPageUser(nextPath = "/") {
  const user = await requireAuthenticatedPageUser(nextPath);
  if (!isProfileOnboarded(user)) {
    redirect(`/onboarding/profile?next=${encodeURIComponent(safeInternalPath(nextPath))}`);
  }
  return user;
}
