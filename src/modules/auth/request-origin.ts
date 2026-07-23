import type { NextRequest } from "next/server";

type AppOriginEnvironment = {
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_ENV?: string;
  VERCEL_TARGET_ENV?: string;
  VERCEL_URL?: string;
};

export function getCanonicalAppOrigin(
  request: NextRequest,
  environment: AppOriginEnvironment = process.env,
): string {
  const previewOrigins = getVercelPreviewOrigins(environment);
  if (previewOrigins.length > 0) {
    return selectPreviewOrigin(request, previewOrigins);
  }

  const configuredUrl = environment.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredUrl) return parseConfiguredAppOrigin(configuredUrl);

  if (
    environment.NODE_ENV === "development"
    && isLoopbackUrl(request.nextUrl)
  ) {
    return request.nextUrl.origin;
  }

  throw new Error(
    "NEXT_PUBLIC_APP_URL is required outside local loopback development.",
  );
}

export function isSameOriginRequest(
  request: NextRequest,
  environment: AppOriginEnvironment = process.env,
): boolean {
  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin) return false;

  try {
    const normalizedOrigin = new URL(suppliedOrigin).origin;
    const previewOrigins = getVercelPreviewOrigins(environment);
    if (previewOrigins.length > 0) {
      return previewOrigins.includes(normalizedOrigin);
    }

    return normalizedOrigin === getCanonicalAppOrigin(request, environment);
  } catch {
    return false;
  }
}

function getVercelPreviewOrigins(
  environment: AppOriginEnvironment,
): string[] {
  if (
    environment.VERCEL_ENV !== "preview"
    || (
      environment.VERCEL_TARGET_ENV
      && environment.VERCEL_TARGET_ENV !== "preview"
    )
  ) {
    return [];
  }

  const origins = [
    parseVercelPreviewOrigin(environment.VERCEL_URL, "VERCEL_URL"),
    parseVercelPreviewOrigin(
      environment.VERCEL_BRANCH_URL,
      "VERCEL_BRANCH_URL",
    ),
  ].filter((origin): origin is string => Boolean(origin));

  return [...new Set(origins)];
}

function selectPreviewOrigin(
  request: NextRequest,
  previewOrigins: string[],
): string {
  const suppliedOrigin = request.headers.get("origin");
  if (suppliedOrigin) {
    try {
      const normalizedOrigin = new URL(suppliedOrigin).origin;
      if (previewOrigins.includes(normalizedOrigin)) return normalizedOrigin;
    } catch {
      // The same-origin check rejects malformed Origin headers.
    }
  }

  if (previewOrigins.includes(request.nextUrl.origin)) {
    return request.nextUrl.origin;
  }

  return previewOrigins[0];
}

function parseVercelPreviewOrigin(
  value: string | undefined,
  label: string,
): string | null {
  const hostname = value?.trim().toLowerCase();
  if (!hostname) return null;
  if (
    hostname.includes("/")
    || hostname.includes(":")
    || hostname.includes("@")
    || hostname.includes("?")
    || hostname.includes("#")
  ) {
    throw new Error(`${label} must contain only a Vercel deployment hostname.`);
  }

  const url = new URL(`https://${hostname}`);
  if (url.hostname !== hostname || !hostname.includes(".")) {
    throw new Error(`${label} must contain a valid Vercel deployment hostname.`);
  }

  return url.origin;
}

function parseConfiguredAppOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid absolute URL.");
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("NEXT_PUBLIC_APP_URL must be an HTTP(S) URL without credentials.");
  }
  if (url.protocol !== "https:" && !isLoopbackHostname(url.hostname)) {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS outside local development.");
  }

  return url.origin;
}

function isLoopbackUrl(url: URL): boolean {
  return ["http:", "https:"].includes(url.protocol)
    && isLoopbackHostname(url.hostname);
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "[::1]";
}
