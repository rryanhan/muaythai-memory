import { z } from "zod";
import { createDrillInputSchema, drillDetailSchema } from "@/modules/drills/contracts";
import {
  profileFirstNameSchema,
  profileLastNameSchema,
  profileLocationSchema,
  profileUsernameSchema,
} from "@/modules/profile/contracts";

export const onboardingProfileInputSchema = z.object({
  username: profileUsernameSchema,
  firstName: profileFirstNameSchema,
  lastName: profileLastNameSchema,
  location: profileLocationSchema,
});

export const onboardingProfileResponseSchema = z.object({
  username: z.string(),
  next: z.literal("first-drill"),
});

export const onboardingFirstDrillResponseSchema = z.object({
  drill: drillDetailSchema,
});

export const onboardingSkipResponseSchema = z.object({
  skipped: z.boolean(),
});

export const onboardingCreationKeySchema = z.string().uuid();

export const onboardingFirstDrillInputSchema = createDrillInputSchema;

export type OnboardingProfileInput = z.input<typeof onboardingProfileInputSchema>;
export type OnboardingFirstDrillInput = z.input<typeof onboardingFirstDrillInputSchema>;
