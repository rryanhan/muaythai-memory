const INTERNAL_ORIGIN = "http://internal.invalid";

/**
 * Accepts app-local paths while rejecting protocol-relative and backslash URL
 * forms that browsers can reinterpret as another origin.
 */
export function safeInternalPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.includes("\\")) return fallback;

  try {
    const parsed = new URL(value, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
