import {
  array as zArray,
  coerce as zCoerce,
  enum as zEnum,
  literal as zLiteral,
  number as zNumber,
  object as zObject,
  string as zString,
  type infer as ZodInfer,
  type input as ZodInput,
} from "zod";
import { JOURNAL_VIDEO_MAX_BYTES, JOURNAL_VIDEO_MIME_TYPES } from "./constants";

export const journalDateSchema = zString()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid training date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
  }, "Use a valid training date.");

const optionalCaptionSchema = zString()
  .trim()
  .max(2000, "Captions must be 2,000 characters or fewer.")
  .optional()
  .nullable()
  .transform((value) => value || null);

export const createJournalUploadInputSchema = zObject({
  fileName: zString().trim().min(1).max(255),
  mimeType: zEnum(JOURNAL_VIDEO_MIME_TYPES),
  sizeBytes: zNumber().int().positive().max(JOURNAL_VIDEO_MAX_BYTES),
  durationMs: zNumber().int().nonnegative().max(24 * 60 * 60 * 1000).optional().nullable(),
  occurredOn: journalDateSchema,
  caption: optionalCaptionSchema,
  drillId: zString().uuid().optional().nullable(),
});

export const updateJournalEntryInputSchema = zObject({
  occurredOn: journalDateSchema,
  caption: optionalCaptionSchema,
  drillId: zString().uuid().optional().nullable(),
});

export const journalDrillSchema = zObject({
  id: zString().uuid(),
  title: zString(),
});

export const journalEntrySummarySchema = zObject({
  id: zString().uuid(),
  occurredOn: journalDateSchema,
  caption: zString().nullable(),
  drill: journalDrillSchema.nullable(),
  durationMs: zNumber().int().nonnegative().nullable(),
  mimeType: zEnum(JOURNAL_VIDEO_MIME_TYPES),
  posterUrl: zString().url().nullable(),
  createdAt: zCoerce.date(),
});

export const journalEntryDetailSchema = journalEntrySummarySchema.extend({
  playbackUrl: zString().url(),
});

export const journalListResponseSchema = zObject({
  entries: zArray(journalEntrySummarySchema),
  nextCursor: zString().nullable(),
});

export const journalDetailResponseSchema = zObject({
  entry: journalEntryDetailSchema,
});

export const journalPreviewResponseSchema = zObject({
  entry: journalEntryDetailSchema.nullable(),
  total: zNumber().int().nonnegative(),
});

export const journalUploadIntentResponseSchema = zObject({
  entryId: zString().uuid(),
  upload: zObject({
    endpoint: zString().url(),
    token: zString().min(1),
    path: zString().min(1),
  }),
});

export const completeJournalUploadResponseSchema = zObject({
  entry: journalEntryDetailSchema,
});

export const journalPosterUploadResponseSchema = zObject({
  uploaded: zLiteral(true),
});

export const deleteJournalEntryResponseSchema = zObject({
  deletedId: zString().uuid(),
});

export type CreateJournalUploadInput = ZodInput<typeof createJournalUploadInputSchema>;
export type UpdateJournalEntryInput = ZodInput<typeof updateJournalEntryInputSchema>;
export type JournalEntrySummary = ZodInfer<typeof journalEntrySummarySchema>;
export type JournalEntryDetail = ZodInfer<typeof journalEntryDetailSchema>;
export type JournalListResponse = ZodInfer<typeof journalListResponseSchema>;
export type JournalPreviewResponse = ZodInfer<typeof journalPreviewResponseSchema>;
export type JournalUploadIntentResponse = ZodInfer<typeof journalUploadIntentResponseSchema>;
export type CompleteJournalUploadResponse = ZodInfer<typeof completeJournalUploadResponseSchema>;
export type DeleteJournalEntryResponse = ZodInfer<typeof deleteJournalEntryResponseSchema>;
