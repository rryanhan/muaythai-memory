import { z, ZodError, type ZodType } from "zod";
import { drillDetailResponseSchema, drillListResponseSchema } from "@/modules/drills/contracts";
import { graphResponseSchema } from "@/modules/graph/contracts";
import { taxonomyResponseSchema } from "@/modules/taxonomy/contracts";
import type {
  ApiClientOptions,
  CreateDrillInput,
  DrillDetail,
  DrillFilterInput,
  DrillListResponse,
  GraphOptionsInput,
  GraphResponse,
  TaxonomyResponse,
} from "./types";

// Frontend-facing API client for the Muay Thai drill app. These functions are
// intentionally thin: build a URL, call the existing API route, and validate
// the response contract before React components touch the data.
export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly responseBody: unknown;

  constructor(message: string, params: { status: number; statusText: string; url: string; responseBody: unknown }) {
    super(message);
    this.name = "ApiError";
    this.status = params.status;
    this.statusText = params.statusText;
    this.url = params.url;
    this.responseBody = params.responseBody;
  }
}

export class ApiResponseValidationError extends Error {
  readonly url: string;
  readonly issues: ZodError["issues"];

  constructor(url: string, error: ZodError) {
    super(`API response did not match the expected contract for ${url}`);
    this.name = "ApiResponseValidationError";
    this.url = url;
    this.issues = error.issues;
  }
}

// Taxonomy is app-wide reference data: Training Methods, tag categories, tags,
// custom tags, and Status Tags.
export async function getTaxonomy(options: ApiClientOptions = {}): Promise<TaxonomyResponse> {
  return fetchJson("/api/taxonomy", taxonomyResponseSchema, options);
}

// Drill lists power the organized library, profile collections, and search
// result views. Full steps stay out of this response.
export async function getDrills(
  filters: DrillFilterInput = {},
  options: ApiClientOptions = {},
): Promise<DrillListResponse> {
  return fetchJson(buildDrillsApiPath(filters), drillListResponseSchema, options);
}

// Drill detail is loaded on demand when the user opens a row or graph node.
export async function getDrill(id: string, options: ApiClientOptions = {}): Promise<DrillDetail> {
  const drillId = z.string().uuid().parse(id);
  const response = await fetchJson(`/api/drills/${encodeURIComponent(drillId)}`, drillDetailResponseSchema, options);
  return response.drill;
}

export async function createDrill(input: CreateDrillInput, options: ApiClientOptions = {}): Promise<DrillDetail> {
  const response = await fetchJson("/api/drills", drillDetailResponseSchema, options, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return response.drill;
}

// Graph data is lightweight node/edge data, not full drill records.
export async function getGraph(
  filters: DrillFilterInput = {},
  graphOptions: GraphOptionsInput = {},
  options: ApiClientOptions = {},
): Promise<GraphResponse> {
  return fetchJson(buildGraphApiPath(filters, graphOptions), graphResponseSchema, options);
}

export function buildDrillsApiPath(filters: DrillFilterInput = {}): string {
  return appendQueryString("/api/drills", buildDrillSearchParams(filters));
}

export function buildGraphApiPath(filters: DrillFilterInput = {}, graphOptions: GraphOptionsInput = {}): string {
  const searchParams = buildDrillSearchParams(filters);

  appendBoolean(searchParams, "showTags", graphOptions.showTags);
  appendBoolean(searchParams, "showCustomTags", graphOptions.showCustomTags);
  appendBoolean(searchParams, "showStatusTags", graphOptions.showStatusTags);

  return appendQueryString("/api/graph", searchParams);
}

export function buildDrillSearchParams(filters: DrillFilterInput = {}): URLSearchParams {
  const searchParams = new URLSearchParams();
  // The backend has one tag filter, but the frontend can keep standard and
  // custom tag controls separate for UI clarity.
  const tagSlugs = [
    ...(filters.tagSlugs ?? []),
    ...(filters.standardTagSlugs ?? []),
    ...(filters.customTagSlugs ?? []),
  ];

  appendStringList(searchParams, "keyword", filters.keywords);
  appendStringList(searchParams, "method", filters.methodSlugs);
  appendStringList(searchParams, "tag", tagSlugs);
  appendStringList(searchParams, "status", filters.statusTagSlugs);

  if (filters.tagMode) searchParams.set("tagMode", filters.tagMode);
  if (filters.statusMode) searchParams.set("statusMode", filters.statusMode);

  return searchParams;
}

async function fetchJson<T>(
  path: string,
  schema: ZodType<T>,
  options: ApiClientOptions,
  requestInit: RequestInit = {},
): Promise<T> {
  const url = resolveApiUrl(path, options.baseUrl);
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(url, {
    ...options.requestInit,
    ...requestInit,
    method: requestInit.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...options.headers,
      ...requestInit.headers,
    },
  });

  const responseBody = await readResponseBody(response);

  // Keep HTTP failures separate from schema drift. UI code can react to these
  // error classes differently later.
  if (!response.ok) {
    throw new ApiError(`API request failed with ${response.status} ${response.statusText}`, {
      status: response.status,
      statusText: response.statusText,
      url,
      responseBody,
    });
  }

  try {
    // Parse after fetch so frontend code receives typed data or an explicit
    // validation error instead of trusting unknown JSON.
    return schema.parse(responseBody);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiResponseValidationError(url, error);
    }
    throw error;
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function resolveApiUrl(path: string, baseUrl?: string): string {
  if (/^https?:\/\//.test(path)) return path;

  const configuredBaseUrl = baseUrl ?? getEnvironmentBaseUrl();

  // Server-side scripts/tests need an absolute URL. Browser calls can use
  // relative paths, which keeps deployment origins flexible.
  if (configuredBaseUrl) {
    return new URL(path, ensureTrailingSlash(configuredBaseUrl)).toString();
  }

  if (typeof window !== "undefined") {
    return path;
  }

  throw new Error("A baseUrl is required when calling API fetchers outside the browser.");
}

function getEnvironmentBaseUrl(): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
}

function appendQueryString(path: string, searchParams: URLSearchParams): string {
  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function appendStringList(searchParams: URLSearchParams, key: string, values: string[] | undefined) {
  for (const value of normalizeStringList(values ?? [])) {
    searchParams.append(key, value);
  }
}

function appendBoolean(searchParams: URLSearchParams, key: string, value: boolean | undefined) {
  if (value === true) {
    searchParams.set(key, "true");
  }
}

function normalizeStringList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
