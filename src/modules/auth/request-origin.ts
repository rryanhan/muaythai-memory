import type { NextRequest } from "next/server";

type AppOriginEnvironment = {
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
};

export function getCanonicalAppOrigin(
  request: NextRequest,
  environment: AppOriginEnvironment = process.env,
): string {
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
    return new URL(suppliedOrigin).origin
      === getCanonicalAppOrigin(request, environment);
  } catch {
    return false;
  }
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
