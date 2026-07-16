import { z } from "zod";

export const profileDtoSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  email: z.string().email().nullable(),
});

export const profileResponseSchema = z.object({
  profile: profileDtoSchema,
});

export const profileDisplayNameSchema = z.string().trim().min(1, "Enter a display name.").max(120);

export type ProfileDto = z.infer<typeof profileDtoSchema>;
export type ProfileResponse = z.infer<typeof profileResponseSchema>;
