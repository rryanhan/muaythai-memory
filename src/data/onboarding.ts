import {
  onboardingFirstDrillResponseSchema,
  onboardingProfileResponseSchema,
  onboardingSkipResponseSchema,
  type OnboardingFirstDrillInput,
  type OnboardingProfileInput,
} from "@/modules/onboarding/contracts";
import { ApiError, fetchJson } from "./api-core";

export async function completeOnboardingProfile(input: OnboardingProfileInput) {
  return fetchJson("/api/onboarding/profile", onboardingProfileResponseSchema, {}, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).catch(rethrowProductError);
}

export async function createOnboardingFirstDrill(input: OnboardingFirstDrillInput) {
  return fetchJson("/api/onboarding/first-drill", onboardingFirstDrillResponseSchema, {}, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((response) => response.drill).catch(rethrowProductError);
}

export async function skipOnboardingFirstDrill() {
  return fetchJson("/api/onboarding/skip", onboardingSkipResponseSchema, {}, {
    method: "POST",
  }).catch(rethrowProductError);
}

function rethrowProductError(error: unknown): never {
  if (error instanceof ApiError && isErrorBody(error.responseBody)) {
    throw new Error(error.responseBody.error);
  }
  throw error;
}

function isErrorBody(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string";
}
