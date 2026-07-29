import { z } from "zod";
import { profileUsernameSchema } from "@/modules/profile/contracts";

export const friendshipStateSchema = z.enum([
  "self",
  "none",
  "incoming",
  "outgoing",
  "friends",
  "blocked",
]);

export const fighterSummarySchema = z.object({
  id: z.string().uuid(),
  username: profileUsernameSchema,
  avatarUrl: z.string().url().nullable(),
});

export const friendSectionSchema = z.enum([
  "friends",
  "incoming",
  "outgoing",
  "blocked",
]);

export const friendSectionItemSchema = z.object({
  profile: fighterSummarySchema,
  occurredAt: z.coerce.date(),
});

export const friendCountsSchema = z.object({
  friends: z.number().int().nonnegative(),
  incoming: z.number().int().nonnegative(),
  outgoing: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
});

export const friendsSummaryResponseSchema = z.object({
  counts: friendCountsSchema,
});

export const friendSectionPageResponseSchema = z.object({
  section: friendSectionSchema,
  items: z.array(friendSectionItemSchema),
  nextCursor: z.string().nullable(),
});

export const fighterConnectionSchema = z.object({
  profile: fighterSummarySchema,
  relationship: friendshipStateSchema,
  requestedAt: z.coerce.date().nullable(),
  connectedAt: z.coerce.date().nullable(),
});

export const fighterSearchResponseSchema = z.object({
  fighter: fighterConnectionSchema.nullable(),
});

export const friendTrainingMethodStatSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  iconKey: z.string().nullable(),
  count: z.number().int().nonnegative(),
});

export const fighterProfileSchema = fighterConnectionSchema.extend({
  stats: z.object({
    drillCount: z.number().int().nonnegative(),
    trainingMethods: z.array(friendTrainingMethodStatSchema),
  }).nullable(),
});

export const fighterProfileResponseSchema = z.object({
  fighter: fighterProfileSchema,
});

export const sendFriendRequestInputSchema = z.object({
  username: profileUsernameSchema,
});

export const respondToFriendRequestInputSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

export const friendReportReasonSchema = z.enum([
  "spam",
  "harassment",
  "impersonation",
  "unsafe-content",
  "other",
]);

export const reportFighterInputSchema = z.object({
  userId: z.string().uuid(),
  reason: friendReportReasonSchema,
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

export const friendMutationResponseSchema = z.object({
  userId: z.string().uuid(),
  relationship: friendshipStateSchema,
});

export const removeFriendResponseSchema = z.object({
  removedUserId: z.string().uuid(),
});

export type FriendshipState = z.infer<typeof friendshipStateSchema>;
export type FighterSummary = z.infer<typeof fighterSummarySchema>;
export type FriendSection = z.infer<typeof friendSectionSchema>;
export type FriendSectionItem = z.infer<typeof friendSectionItemSchema>;
export type FriendCounts = z.infer<typeof friendCountsSchema>;
export type FriendsSummaryResponse = z.infer<typeof friendsSummaryResponseSchema>;
export type FriendSectionPageResponse = z.infer<typeof friendSectionPageResponseSchema>;
export type FighterConnection = z.infer<typeof fighterConnectionSchema>;
export type FighterProfile = z.infer<typeof fighterProfileSchema>;
export type SendFriendRequestInput = z.infer<typeof sendFriendRequestInputSchema>;
export type RespondToFriendRequestInput = z.infer<typeof respondToFriendRequestInputSchema>;
export type FriendReportReason = z.infer<typeof friendReportReasonSchema>;
export type ReportFighterInput = z.input<typeof reportFighterInputSchema>;
export type ReportFighterResponse = z.infer<typeof reportFighterResponseSchema>;
export type BlockFighterInput = z.infer<typeof blockFighterInputSchema>;
export type FriendMutationResponse = z.infer<typeof friendMutationResponseSchema>;
