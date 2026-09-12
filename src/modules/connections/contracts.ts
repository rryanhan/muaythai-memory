import {
  array as zArray,
  boolean as zBoolean,
  coerce as zCoerce,
  enum as zEnum,
  number as zNumber,
  object as zObject,
  string as zString,
  type infer as ZodInfer,
  type input as ZodInput,
} from "zod";
import { profileUsernameSchema } from "@/modules/profile/contracts";

export const followStatusSchema = zEnum(["none", "pending", "accepted"]);

export const followDirectionSchema = zObject({
  status: followStatusSchema,
  requestedAt: zCoerce.date().nullable(),
  acceptedAt: zCoerce.date().nullable(),
});

export const fighterSummarySchema = zObject({
  id: zString().uuid(),
  username: profileUsernameSchema,
  avatarUrl: zString().url().nullable(),
});

export const connectionSectionSchema = zEnum([
  "followers",
  "following",
  "incoming",
  "outgoing",
  "blocked",
]);

export const publicConnectionSectionSchema = zEnum(["followers", "following"]);

export const connectionSectionItemSchema = zObject({
  profile: fighterSummarySchema,
  occurredAt: zCoerce.date(),
});

export const connectionCountsSchema = zObject({
  followers: zNumber().int().nonnegative(),
  following: zNumber().int().nonnegative(),
  incoming: zNumber().int().nonnegative(),
  outgoing: zNumber().int().nonnegative(),
  blocked: zNumber().int().nonnegative(),
});

export const connectionsSummaryResponseSchema = zObject({
  counts: connectionCountsSchema,
});

export const connectionSectionPageResponseSchema = zObject({
  section: connectionSectionSchema,
  items: zArray(connectionSectionItemSchema),
  nextCursor: zString().nullable(),
});

export const fighterConnectionSchema = zObject({
  profile: fighterSummarySchema,
  isSelf: zBoolean(),
  blockedByViewer: zBoolean(),
  outgoing: followDirectionSchema,
  incoming: followDirectionSchema,
  mutual: zBoolean(),
});

export const fighterSearchResponseSchema = zObject({
  fighter: fighterConnectionSchema.nullable(),
});

export const trainingMethodStatSchema = zObject({
  id: zString().uuid(),
  name: zString(),
  slug: zString(),
  iconKey: zString().nullable(),
  count: zNumber().int().nonnegative(),
});

export const publicSocialCountsSchema = zObject({
  followers: zNumber().int().nonnegative(),
  following: zNumber().int().nonnegative(),
});

export const fighterProfileSchema = fighterConnectionSchema.extend({
  socialCounts: publicSocialCountsSchema,
  canViewConnections: zBoolean(),
  stats: zObject({
    drillCount: zNumber().int().nonnegative(),
    trainingMethods: zArray(trainingMethodStatSchema),
  }).nullable(),
});

export const fighterProfileResponseSchema = zObject({
  fighter: fighterProfileSchema,
});

export const authorizedConnectionPageResponseSchema = zObject({
  owner: fighterSummarySchema,
  section: publicConnectionSectionSchema,
  items: zArray(connectionSectionItemSchema),
  nextCursor: zString().nullable(),
});

export const requestFollowInputSchema = zObject({
  username: profileUsernameSchema,
});

export const respondToFollowRequestInputSchema = zObject({
  action: zEnum(["accept", "decline"]),
});

export const connectionMutationResponseSchema = zObject({
  userId: zString().uuid(),
  blockedByViewer: zBoolean(),
  outgoing: followDirectionSchema,
  incoming: followDirectionSchema,
  mutual: zBoolean(),
});

export const reportReasonSchema = zEnum([
  "spam",
  "harassment",
  "impersonation",
  "unsafe-content",
  "other",
]);

export const reportFighterInputSchema = zObject({
  userId: zString().uuid(),
  reason: reportReasonSchema,
  details: zString().trim().max(500).optional().nullable()
    .transform((value) => value || null),
});

export const reportFighterResponseSchema = zObject({
  reportId: zString().uuid(),
  reportedUserId: zString().uuid(),
});

export const blockFighterInputSchema = zObject({
  userId: zString().uuid(),
});

export type FollowStatus = ZodInfer<typeof followStatusSchema>;
export type FollowDirection = ZodInfer<typeof followDirectionSchema>;
export type FighterSummary = ZodInfer<typeof fighterSummarySchema>;
export type ConnectionSection = ZodInfer<typeof connectionSectionSchema>;
export type PublicConnectionSection = ZodInfer<typeof publicConnectionSectionSchema>;
export type ConnectionSectionItem = ZodInfer<typeof connectionSectionItemSchema>;
export type ConnectionCounts = ZodInfer<typeof connectionCountsSchema>;
export type ConnectionsSummaryResponse = ZodInfer<typeof connectionsSummaryResponseSchema>;
export type ConnectionSectionPageResponse = ZodInfer<typeof connectionSectionPageResponseSchema>;
export type FighterConnection = ZodInfer<typeof fighterConnectionSchema>;
export type FighterProfile = ZodInfer<typeof fighterProfileSchema>;
export type AuthorizedConnectionPageResponse = ZodInfer<typeof authorizedConnectionPageResponseSchema>;
export type RespondToFollowRequestInput = ZodInfer<typeof respondToFollowRequestInputSchema>;
export type ConnectionMutationResponse = ZodInfer<typeof connectionMutationResponseSchema>;
export type ReportReason = ZodInfer<typeof reportReasonSchema>;
export type ReportFighterInput = ZodInput<typeof reportFighterInputSchema>;
export type ReportFighterResponse = ZodInfer<typeof reportFighterResponseSchema>;
