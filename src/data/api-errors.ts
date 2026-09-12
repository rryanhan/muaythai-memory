import type { ZodError } from "zod";

// Error inspection is intentionally separate from the validating transport so
// UI-only error messages do not eagerly load the Zod runtime.
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

export function isApiErrorBody(value: unknown): value is { error: string } {
  return typeof value === "object"
    && value !== null
    && "error" in value
    && typeof value.error === "string";
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
