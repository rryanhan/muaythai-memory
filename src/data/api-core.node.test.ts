// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { fetchJson } from "./api-core";

const responseSchema = z.object({ ok: z.literal(true) });

describe("API URL resolution outside the browser", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the configured server base URL", async () => {
    vi.stubEnv("API_BASE_URL", "https://server.example/root");
    const fetcher = vi.fn(async () => jsonResponse({ ok: true }));

    await fetchJson("/api/example", responseSchema, { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      "https://server.example/api/example",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("falls back to the public app URL for server-side verifiers", async () => {
    vi.stubEnv("API_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://public.example/root");
    const fetcher = vi.fn(async () => jsonResponse({ ok: true }));

    await fetchJson("/api/example", responseSchema, { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      "https://public.example/api/example",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("accepts case-insensitive absolute HTTP URLs without a configured base URL", async () => {
    vi.stubEnv("API_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const fetcher = vi.fn(async () => jsonResponse({ ok: true }));

    await fetchJson("HTTPS://api.example/resource", responseSchema, { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      "HTTPS://api.example/resource",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("requires a base URL when none is configured", async () => {
    vi.stubEnv("API_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const fetcher = vi.fn();

    await expect(fetchJson("/api/example", responseSchema, { fetcher })).rejects.toThrow(
      "A baseUrl is required when calling API fetchers outside the browser.",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
