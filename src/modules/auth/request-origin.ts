import type { NextRequest } from "next/server";

export function getPublicRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  if (!host) return request.nextUrl.origin;

  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || request.nextUrl.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

export function isSameOriginRequest(request: NextRequest): boolean {
  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin) return false;

  try {
    return new URL(suppliedOrigin).origin === getPublicRequestOrigin(request);
  } catch {
    return false;
  }
}
