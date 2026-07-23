import { redirect } from "next/navigation";
import { safeInternalPath } from "@/lib/safe-internal-path";
import {
  AuthenticationRequiredError,
  getOnboardingPath,
  isProfileOnboarded,
  OnboardingRequiredError,
  requireCurrentAppUser,
  requireCurrentOnboardingState,
  requireProfileOnboardedUserId,
} from "./current-user";

export async function requireCurrentPageUser(nextPath = "/") {
  try {
    const state = await requireCurrentOnboardingState();
    const onboardingPath = getOnboardingPath(state, safeInternalPath(nextPath));
    if (onboardingPath) redirect(onboardingPath);
    return requireCurrentAppUser();
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error;
    redirect(`/auth/sign-in?next=${encodeURIComponent(safeInternalPath(nextPath))}`);
  }
}

export async function requireCurrentPageUserId(nextPath = "/") {
  try {
    const state = await requireCurrentOnboardingState();
    const onboardingPath = getOnboardingPath(state, safeInternalPath(nextPath));
    if (onboardingPath) redirect(onboardingPath);
    return state.id;
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error;
    redirect(`/auth/sign-in?next=${encodeURIComponent(safeInternalPath(nextPath))}`);
  }
}

export async function requireProfileOnboardedPageUserId(nextPath = "/") {
  try {
    return await requireProfileOnboardedUserId();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(`/auth/sign-in?next=${encodeURIComponent(safeInternalPath(nextPath))}`);
    }
    if (!(error instanceof OnboardingRequiredError)) throw error;
    redirect(`/onboarding/profile?next=${encodeURIComponent(safeInternalPath(nextPath))}`);
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
