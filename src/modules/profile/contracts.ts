import {
  array as zArray,
  number as zNumber,
  object as zObject,
  string as zString,
  type infer as ZodInfer,
} from "zod";

export const profileDtoSchema = zObject({
  id: zString().uuid(),
  displayName: zString(),
  username: zString().nullable(),
  firstName: zString().nullable(),
  lastName: zString().nullable(),
  location: zString().nullable(),
  avatarUrl: zString().url().nullable(),
  email: zString().email().nullable(),
});

export const profileResponseSchema = zObject({
  profile: profileDtoSchema,
});

export const profileOverviewTrainingMethodSchema = zObject({
  id: zString().uuid(),
  name: zString(),
  slug: zString(),
  iconKey: zString(),
  count: zNumber().int().nonnegative(),
});

export const profileOverviewSchema = zObject({
  drillCount: zNumber().int().nonnegative(),
  favouriteCount: zNumber().int().nonnegative(),
  drillBackInCount: zNumber().int().nonnegative(),
  trainingMethods: zArray(profileOverviewTrainingMethodSchema),
});

export const profileOverviewResponseSchema = zObject({
  overview: profileOverviewSchema,
});

export const profileUsernameSchema = zString()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters.")
  .max(30, "Username must be 30 characters or fewer.")
  .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores only.");

export const profileFirstNameSchema = optionalProfileField(80, "First name");
export const profileLastNameSchema = optionalProfileField(80, "Last name");
export const profileLocationSchema = optionalProfileField(120, "Location");

export type ProfileDto = ZodInfer<typeof profileDtoSchema>;
export type ProfileResponse = ZodInfer<typeof profileResponseSchema>;
export type ProfileOverview = ZodInfer<typeof profileOverviewSchema>;
export type ProfileOverviewResponse = ZodInfer<typeof profileOverviewResponseSchema>;

function optionalProfileField(max: number, label: string) {
  return zString()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .transform((value) => value || null);
}
