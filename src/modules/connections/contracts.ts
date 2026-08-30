import { z } from "zod";
import { profileUsernameSchema } from "@/modules/profile/contracts";

export const followStatusSchema = z.enum(["none", "pending", "accepted"]);

export const followDirectionSchema = z.object({
  status: followStatusSchema,
  requestedAt: z.coerce.date().nullable(),
  acceptedAt: z.coerce.date().nullable(),
});

export const fighterSummarySchema = z.object({
  id: z.string().uuid(),
  username: profileUsernameSchema,
  avatarUrl: z.string().url().nullable(),
});

export const connectionSectionSchema = z.enum([
  "followers",
  "following",
  "incoming",
  "outgoing",
  "blocked",
]);

export const publicConnectionSectionSchema = z.enum(["followers", "following"]);

export const connectionSectionItemSchema = z.object({
  profile: fighterSummarySchema,
  occurredAt: z.coerce.date(),
});

export const connectionCountsSchema = z.object({
  followers: z.number().int().nonnegative(),
  following: z.number().int().nonnegative(),
  incoming: z.number().int().nonnegative(),
  outgoing: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
});

export const connectionsSummaryResponseSchema = z.object({
  counts: connectionCountsSchema,
});

export const connectionSectionPageResponseSchema = z.object({
  section: connectionSectionSchema,
  items: z.array(connectionSectionItemSchema),
  nextCursor: z.string().nullable(),
});

export const fighterConnectionSchema = z.object({
  profile: fighterSummarySchema,
  isSelf: z.boolean(),
  blockedByViewer: z.boolean(),
  outgoing: followDirectionSchema,
  incoming: followDirectionSchema,
  mutual: z.boolean(),
});

export const fighterSearchResponseSchema = z.object({
  fighter: fighterConnectionSchema.nullable(),
});

export const trainingMethodStatSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  iconKey: z.string().nullable(),
  count: z.number().int().nonnegative(),
});

export const publicSocialCountsSchema = z.object({
  followers: z.number().int().nonnegative(),
  following: z.number().int().nonnegative(),
});

export const fighterProfileSchema = fighterConnectionSchema.extend({
  socialCounts: publicSocialCountsSchema,
  canViewConnections: z.boolean(),
  stats: z.object({
    drillCount: z.number().int().nonnegative(),
    trainingMethods: z.array(trainingMethodStatSchema),
  }).nullable(),
});

export const fighterProfileResponseSchema = z.object({
  fighter: fighterProfileSchema,
});

export const authorizedConnectionPageResponseSchema = z.object({
  owner: fighterSummarySchema,
  section: publicConnectionSectionSchema,
  items: z.array(connectionSectionItemSchema),
  nextCursor: z.string().nullable(),
});

export const requestFollowInputSchema = z.object({
  username: profileUsernameSchema,
});

export const respondToFollowRequestInputSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

export const connectionMutationResponseSchema = z.object({
  userId: z.string().uuid(),
  blockedByViewer: z.boolean(),
  outgoing: followDirectionSchema,
  incoming: followDirectionSchema,
  mutual: z.boolean(),
});

export const reportReasonSchema = z.enum([
  "spam",
  "harassment",
  "impersonation",
  "unsafe-content",
  "other",
]);

export const reportFighterInputSchema = z.object({
  userId: z.string().uuid(),
  reason: reportReasonSchema,
  details: z.string().trim().max(500).optional().nullable()
    .transform((value) => value || null),
});

export const reportFighterResponseSchema = z.object({
  reportId: z.string().uuid(),
  reportedUserId: z.string().uuid(),
});

export const blockFighterInputSchema = z.object({
  userId: z.string().uuid(),
});

export type FollowStatus = z.infer<typeof followStatusSchema>;
export type FollowDirection = z.infer<typeof followDirectionSchema>;
export type FighterSummary = z.infer<typeof fighterSummarySchema>;
export type ConnectionSection = z.infer<typeof connectionSectionSchema>;
export type PublicConnectionSection = z.infer<typeof publicConnectionSectionSchema>;
export type ConnectionSectionItem = z.infer<typeof connectionSectionItemSchema>;
export type ConnectionCounts = z.infer<typeof connectionCountsSchema>;
export type ConnectionsSummaryResponse = z.infer<typeof connectionsSummaryResponseSchema>;
export type ConnectionSectionPageResponse = z.infer<typeof connectionSectionPageResponseSchema>;
export type FighterConnection = z.infer<typeof fighterConnectionSchema>;
export type FighterProfile = z.infer<typeof fighterProfileSchema>;
export type AuthorizedConnectionPageResponse = z.infer<typeof authorizedConnectionPageResponseSchema>;
export type RespondToFollowRequestInput = z.infer<typeof respondToFollowRequestInputSchema>;
export type ConnectionMutationResponse = z.infer<typeof connectionMutationResponseSchema>;
export type ReportReason = z.infer<typeof reportReasonSchema>;
export type ReportFighterInput = z.input<typeof reportFighterInputSchema>;
export type ReportFighterResponse = z.infer<typeof reportFighterResponseSchema>;
