import { ZodError, type ZodType } from "zod";
import type { ApiClientOptions } from "./types";

// Shared transport and validation errors stay independent of any product
// domain so feature clients do not compile every API contract at once.
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

export async function fetchJson<T>(
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

  if (!response.ok) {
    throw new ApiError(`API request failed with ${response.status} ${response.statusText}`, {
      status: response.status,
      statusText: response.statusText,
      url,
      responseBody,
    });
  }

  try {
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
  return contentType.includes("application/json") ? response.json() : response.text();
}

function resolveApiUrl(path: string, baseUrl?: string): string {
  if (/^https?:\/\//.test(path)) return path;

  const configuredBaseUrl = baseUrl ?? getEnvironmentBaseUrl();
  if (configuredBaseUrl) {
    return new URL(path, ensureTrailingSlash(configuredBaseUrl)).toString();
  }

  if (typeof window !== "undefined") return path;

  throw new Error("A baseUrl is required when calling API fetchers outside the browser.");
}

function getEnvironmentBaseUrl(): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
