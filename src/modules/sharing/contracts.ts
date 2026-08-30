import { z } from "zod";
import {
  drillDetailSchema,
  drillSummarySchema,
} from "@/modules/drills/contracts";
import { fighterSummarySchema } from "@/modules/connections/contracts";

export const drillShareRecipientItemSchema = z.object({
  profile: fighterSummarySchema,
  shared: z.boolean(),
});

export const drillShareRecipientPageSchema = z.object({
  items: z.array(drillShareRecipientItemSchema),
  nextCursor: z.string().nullable(),
});

export const updateDrillShareInputSchema = z.object({
  recipientUserId: z.string().uuid(),
  shared: z.boolean(),
});

export const updateDrillShareResponseSchema = z.object({
  drillId: z.string().uuid(),
  recipientUserId: z.string().uuid(),
  shared: z.boolean(),
});

export const sharedDrillListItemSchema = z.object({
  drill: drillSummarySchema,
  owner: fighterSummarySchema,
  sharedAt: z.coerce.date(),
});

export const sharedDrillListResponseSchema = z.object({
  items: z.array(sharedDrillListItemSchema),
  nextCursor: z.string().nullable(),
});

export const sharedDrillDetailResponseSchema = z.object({
  drill: drillDetailSchema,
  owner: fighterSummarySchema,
  sharedAt: z.coerce.date(),
});

export type DrillShareRecipientItem = z.infer<typeof drillShareRecipientItemSchema>;
export type DrillShareRecipientPage = z.infer<typeof drillShareRecipientPageSchema>;
export type UpdateDrillShareInput = z.infer<typeof updateDrillShareInputSchema>;
export type UpdateDrillShareResponse = z.infer<typeof updateDrillShareResponseSchema>;
export type SharedDrillListItem = z.infer<typeof sharedDrillListItemSchema>;
export type SharedDrillListResponse = z.infer<typeof sharedDrillListResponseSchema>;
export type SharedDrillDetailResponse = z.infer<typeof sharedDrillDetailResponseSchema>;
