import {
  onboardingFirstDrillResponseSchema,
  onboardingCreationKeySchema,
  onboardingProfileResponseSchema,
  onboardingSkipResponseSchema,
  type OnboardingFirstDrillInput,
  type OnboardingProfileInput,
} from "@/modules/onboarding/contracts";
import { ApiError, fetchJson } from "./api-core";
import type { ApiClientOptions } from "./types";

const onboardingCreationKeyStorage = "muaythai:first-drill-creation-key";
let volatileCreationKey: string | null = null;

export async function completeOnboardingProfile(input: OnboardingProfileInput) {
  return fetchJson("/api/onboarding/profile", onboardingProfileResponseSchema, {}, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).catch(rethrowProductError);
}

export async function createOnboardingFirstDrill(
  input: OnboardingFirstDrillInput,
  options: ApiClientOptions = {},
) {
  const creationKey = getOrCreateOnboardingCreationKey();
  return fetchJson("/api/onboarding/first-drill", onboardingFirstDrillResponseSchema, options, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": creationKey,
    },
    body: JSON.stringify(input),
  })
    .then((response) => {
      clearOnboardingCreationKey(creationKey);
      return response.drill;
    })
    .catch(rethrowProductError);
}

export async function skipOnboardingFirstDrill(options: ApiClientOptions = {}) {
  return fetchJson("/api/onboarding/skip", onboardingSkipResponseSchema, options, {
    method: "POST",
  })
    .then((response) => {
      clearOnboardingCreationKey();
      return response;
    })
    .catch(rethrowProductError);
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

function getOrCreateOnboardingCreationKey(): string {
  const storedKey = readStoredCreationKey();
  if (storedKey) return storedKey;

  const creationKey = crypto.randomUUID();
  volatileCreationKey = creationKey;
  try {
    window.sessionStorage.setItem(onboardingCreationKeyStorage, creationKey);
  } catch {
    // Some embedded/private browsing contexts deny sessionStorage.
  }
  return creationKey;
}

function readStoredCreationKey(): string | null {
  try {
    const storedKey = window.sessionStorage.getItem(onboardingCreationKeyStorage);
    const parsedKey = onboardingCreationKeySchema.safeParse(storedKey);
    if (parsedKey.success) {
      volatileCreationKey = parsedKey.data;
      return parsedKey.data;
    }
    if (storedKey) window.sessionStorage.removeItem(onboardingCreationKeyStorage);
  } catch {
    // Fall back to the module-local key for this mounted attempt.
  }
  return volatileCreationKey;
}

function clearOnboardingCreationKey(expectedKey?: string): void {
  if (expectedKey && volatileCreationKey !== expectedKey) return;
  volatileCreationKey = null;
  try {
    const storedKey = window.sessionStorage.getItem(onboardingCreationKeyStorage);
    if (!expectedKey || storedKey === expectedKey) {
      window.sessionStorage.removeItem(onboardingCreationKeyStorage);
    }
  } catch {
    // The in-memory key was still cleared.
  }
}
