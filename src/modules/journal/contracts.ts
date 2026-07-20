import { z } from "zod";
import { JOURNAL_VIDEO_MAX_BYTES, JOURNAL_VIDEO_MIME_TYPES } from "./constants";

export const journalEntryStatusSchema = z.enum(["uploading", "ready"]);

export const journalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid training date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
  }, "Use a valid training date.");

const optionalCaptionSchema = z
  .string()
  .trim()
  .max(2000, "Captions must be 2,000 characters or fewer.")
  .optional()
  .nullable()
  .transform((value) => value || null);

export const createJournalUploadInputSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(JOURNAL_VIDEO_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(JOURNAL_VIDEO_MAX_BYTES),
  durationMs: z.number().int().nonnegative().max(24 * 60 * 60 * 1000).optional().nullable(),
  occurredOn: journalDateSchema,
  caption: optionalCaptionSchema,
  drillId: z.string().uuid().optional().nullable(),
});

export const updateJournalEntryInputSchema = z.object({
  occurredOn: journalDateSchema,
  caption: optionalCaptionSchema,
  drillId: z.string().uuid().optional().nullable(),
});

export const journalDrillSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
});

export const journalEntrySummarySchema = z.object({
  id: z.string().uuid(),
  occurredOn: journalDateSchema,
  caption: z.string().nullable(),
  drill: journalDrillSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  mimeType: z.enum(JOURNAL_VIDEO_MIME_TYPES),
  posterUrl: z.string().url().nullable(),
  createdAt: z.coerce.date(),
});

export const journalEntryDetailSchema = journalEntrySummarySchema.extend({
  playbackUrl: z.string().url(),
});

export const journalListResponseSchema = z.object({
  entries: z.array(journalEntrySummarySchema),
  nextCursor: z.string().nullable(),
});

export const journalDetailResponseSchema = z.object({
  entry: journalEntryDetailSchema,
});

export const journalPreviewResponseSchema = z.object({
  entry: journalEntryDetailSchema.nullable(),
  total: z.number().int().nonnegative(),
});

export const journalUploadIntentResponseSchema = z.object({
  entryId: z.string().uuid(),
  upload: z.object({
    endpoint: z.string().url(),
    token: z.string().min(1),
    path: z.string().min(1),
  }),
});

export const completeJournalUploadResponseSchema = z.object({
  entry: journalEntryDetailSchema,
});

export const journalPosterUploadResponseSchema = z.object({
  uploaded: z.literal(true),
});

export const deleteJournalEntryResponseSchema = z.object({
  deletedId: z.string().uuid(),
});

export type CreateJournalUploadInput = z.input<typeof createJournalUploadInputSchema>;
export type UpdateJournalEntryInput = z.input<typeof updateJournalEntryInputSchema>;
export type JournalEntrySummary = z.infer<typeof journalEntrySummarySchema>;
export type JournalEntryDetail = z.infer<typeof journalEntryDetailSchema>;
export type JournalListResponse = z.infer<typeof journalListResponseSchema>;
export type JournalPreviewResponse = z.infer<typeof journalPreviewResponseSchema>;
export type JournalUploadIntentResponse = z.infer<typeof journalUploadIntentResponseSchema>;
export type CompleteJournalUploadResponse = z.infer<typeof completeJournalUploadResponseSchema>;
export type DeleteJournalEntryResponse = z.infer<typeof deleteJournalEntryResponseSchema>;
