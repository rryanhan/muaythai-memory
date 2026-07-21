import { z } from "zod";

export const profileDtoSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  username: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  location: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  email: z.string().email().nullable(),
});

export const profileResponseSchema = z.object({
  profile: profileDtoSchema,
});

export const profileUsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters.")
  .max(30, "Username must be 30 characters or fewer.")
  .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores only.");

export const profileFirstNameSchema = optionalProfileField(80, "First name");
export const profileLastNameSchema = optionalProfileField(80, "Last name");
export const profileLocationSchema = optionalProfileField(120, "Location");

export type ProfileDto = z.infer<typeof profileDtoSchema>;
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

function optionalProfileField(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .transform((value) => value || null);
}
