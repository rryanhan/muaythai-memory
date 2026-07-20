import type {
  CaptureDraft,
  CaptureDraftRequest,
  CaptureDraftResponse,
  CaptureTranscriptionResponse,
} from "@/modules/capture/contracts";
import type {
  CreateDrillInput,
  DeleteDrillResponse,
  DrillDetail,
  DrillFilters,
  DrillListResponse,
  DrillSummary,
  FilterMode,
  UpdateDrillInput,
  UpdateSavedListInput,
  UpdateSavedListResponse,
  SavedListSlug,
} from "@/modules/drills/contracts";
import type { GraphEdge, GraphNode, GraphOptions, GraphResponse } from "@/modules/graph/contracts";
import type {
  CompleteJournalUploadResponse,
  CreateJournalUploadInput,
  DeleteJournalEntryResponse,
  JournalEntryDetail,
  JournalEntrySummary,
  JournalListResponse,
  JournalPreviewResponse,
  JournalUploadIntentResponse,
  UpdateJournalEntryInput,
} from "@/modules/journal/contracts";
import type { ProfileDto, ProfileResponse } from "@/modules/profile/contracts";
import type { StatusTagDto, TagCategoryDto, TagDto, TaxonomyResponse, TrainingMethodDto } from "@/modules/taxonomy/contracts";

// This file is the frontend import surface for API data types. It reuses the
// pure contract types from backend modules without importing database code.
export type {
  CaptureDraft,
  CaptureDraftRequest,
  CaptureDraftResponse,
  CaptureTranscriptionResponse,
  CreateDrillInput,
  DeleteDrillResponse,
  DrillDetail,
  DrillFilters,
  DrillListResponse,
  DrillSummary,
  FilterMode,
  GraphEdge,
  GraphNode,
  GraphOptions,
  GraphResponse,
  CompleteJournalUploadResponse,
  CreateJournalUploadInput,
  DeleteJournalEntryResponse,
  JournalEntryDetail,
  JournalEntrySummary,
  JournalListResponse,
  JournalPreviewResponse,
  JournalUploadIntentResponse,
  ProfileDto,
  ProfileResponse,
  StatusTagDto,
  SavedListSlug,
  TagCategoryDto,
  TagDto,
  TaxonomyResponse,
  TrainingMethodDto,
  UpdateDrillInput,
  UpdateSavedListInput,
  UpdateSavedListResponse,
  UpdateJournalEntryInput,
};

// UI controls may separate standard and custom tags even though the backend
// receives both through the same tag filter.
export type DrillFilterInput = Partial<Omit<DrillFilters, "tagSlugs">> & {
  tagSlugs?: string[];
  standardTagSlugs?: string[];
  customTagSlugs?: string[];
};

export type GraphOptionsInput = Partial<GraphOptions>;

// Test scripts can inject baseUrl/fetcher. Browser components normally call
// the same functions without any options.
export type ApiClientOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  headers?: HeadersInit;
  requestInit?: Omit<RequestInit, "headers" | "method" | "body">;
};
