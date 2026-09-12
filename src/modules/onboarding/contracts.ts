import {
  boolean as zBoolean,
  literal as zLiteral,
  object as zObject,
  string as zString,
  type input as ZodInput,
} from "zod";
import { createDrillInputSchema, drillDetailSchema } from "@/modules/drills/contracts";
import {
  profileFirstNameSchema,
  profileLastNameSchema,
  profileLocationSchema,
  profileUsernameSchema,
} from "@/modules/profile/contracts";

export const onboardingProfileInputSchema = zObject({
  username: profileUsernameSchema,
  firstName: profileFirstNameSchema,
  lastName: profileLastNameSchema,
  location: profileLocationSchema,
});

export const onboardingProfileResponseSchema = zObject({
  username: zString(),
  next: zLiteral("first-drill"),
});

export const onboardingFirstDrillResponseSchema = zObject({
  drill: drillDetailSchema,
});

export const onboardingSkipResponseSchema = zObject({
  skipped: zBoolean(),
});

export const onboardingCreationKeySchema = zString().uuid();

export const onboardingFirstDrillInputSchema = createDrillInputSchema;

export type OnboardingProfileInput = ZodInput<typeof onboardingProfileInputSchema>;
export type OnboardingFirstDrillInput = ZodInput<typeof onboardingFirstDrillInputSchema>;
