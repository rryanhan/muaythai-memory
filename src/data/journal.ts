import {
  completeJournalUploadResponseSchema,
  createJournalUploadInputSchema,
  deleteJournalEntryResponseSchema,
  journalDetailResponseSchema,
  journalListResponseSchema,
  journalUploadIntentResponseSchema,
  type CreateJournalUploadInput,
  type JournalEntryDetail,
  type JournalListResponse,
  type JournalUploadIntentResponse,
} from "@/modules/journal/contracts";
import { ApiError, fetchJson } from "./api-core";
import type { ApiClientOptions } from "./types";

export async function getJournalEntries(
  input: { cursor?: string | null; limit?: number } = {},
  options: ApiClientOptions = {},
): Promise<JournalListResponse> {
  const params = new URLSearchParams();
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.limit) params.set("limit", String(input.limit));
  return fetchJson(`/api/journal${params.size ? `?${params}` : ""}`, journalListResponseSchema, options);
}

export async function getJournalEntry(id: string, options: ApiClientOptions = {}): Promise<JournalEntryDetail> {
  const response = await fetchJson(`/api/journal/${encodeURIComponent(id)}`, journalDetailResponseSchema, options);
  return response.entry;
}

export async function createJournalUpload(
  rawInput: CreateJournalUploadInput,
  options: ApiClientOptions = {},
): Promise<JournalUploadIntentResponse> {
  const input = createJournalUploadInputSchema.parse(rawInput);
  return requestWithReadableError(
    () => fetchJson("/api/journal/uploads", journalUploadIntentResponseSchema, options, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function completeJournalEntryUpload(
  id: string,
  options: ApiClientOptions = {},
): Promise<JournalEntryDetail> {
  const response = await requestWithReadableError(
    () => fetchJson(`/api/journal/${encodeURIComponent(id)}/complete`, completeJournalUploadResponseSchema, options, {
      method: "POST",
    }),
  );
  return response.entry;
}

export async function deleteJournalEntry(id: string, options: ApiClientOptions = {}): Promise<string> {
  const response = await requestWithReadableError(
    () => fetchJson(`/api/journal/${encodeURIComponent(id)}`, deleteJournalEntryResponseSchema, options, {
      method: "DELETE",
    }),
  );
  return response.deletedId;
}

async function requestWithReadableError<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof ApiError && hasErrorMessage(error.responseBody)) {
      throw new Error(error.responseBody.error);
    }
    throw error;
  }
}

function hasErrorMessage(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string";
}
