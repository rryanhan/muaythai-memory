import {
  array as zArray,
  boolean as zBoolean,
  coerce as zCoerce,
  object as zObject,
  string as zString,
  type infer as ZodInfer,
} from "zod";
import {
  drillDetailSchema,
  drillSummarySchema,
} from "@/modules/drills/contracts";
import { fighterSummarySchema } from "@/modules/connections/contracts";

export const drillShareRecipientItemSchema = zObject({
  profile: fighterSummarySchema,
  shared: zBoolean(),
});

export const drillShareRecipientPageSchema = zObject({
  items: zArray(drillShareRecipientItemSchema),
  nextCursor: zString().nullable(),
});

export const updateDrillShareInputSchema = zObject({
  recipientUserId: zString().uuid(),
  shared: zBoolean(),
});

export const updateDrillShareResponseSchema = zObject({
  drillId: zString().uuid(),
  recipientUserId: zString().uuid(),
  shared: zBoolean(),
});

export const sharedDrillListItemSchema = zObject({
  drill: drillSummarySchema,
  owner: fighterSummarySchema,
  sharedAt: zCoerce.date(),
});

export const sharedDrillListResponseSchema = zObject({
  items: zArray(sharedDrillListItemSchema),
  nextCursor: zString().nullable(),
});

export const sharedDrillDetailResponseSchema = zObject({
  drill: drillDetailSchema,
  owner: fighterSummarySchema,
  sharedAt: zCoerce.date(),
});

export type DrillShareRecipientItem = ZodInfer<typeof drillShareRecipientItemSchema>;
export type DrillShareRecipientPage = ZodInfer<typeof drillShareRecipientPageSchema>;
export type UpdateDrillShareInput = ZodInfer<typeof updateDrillShareInputSchema>;
export type UpdateDrillShareResponse = ZodInfer<typeof updateDrillShareResponseSchema>;
export type SharedDrillListItem = ZodInfer<typeof sharedDrillListItemSchema>;
export type SharedDrillListResponse = ZodInfer<typeof sharedDrillListResponseSchema>;
export type SharedDrillDetailResponse = ZodInfer<typeof sharedDrillDetailResponseSchema>;
