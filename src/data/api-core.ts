import { ZodError, type ZodType } from "zod";
import type { ApiClientOptions } from "./types";
import { ApiError, ApiResponseValidationError } from "./api-errors";

export { ApiError, ApiResponseValidationError, isApiErrorBody } from "./api-errors";

// Shared transport and validation stay independent of any product domain so
// feature clients do not compile every API contract at once.
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
