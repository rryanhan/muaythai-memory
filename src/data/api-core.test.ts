import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { fetchJson } from "./api-core";

const responseSchema = z.object({ ok: z.literal(true) });

describe("API URL resolution in the browser", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps relative requests on the page origin when environment base URLs are configured", async () => {
    vi.stubEnv("API_BASE_URL", "https://server.example");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://configured.example");
    const fetcher = vi.fn(async () => jsonResponse({ ok: true }));

    await expect(fetchJson("/api/example", responseSchema, { fetcher })).resolves.toEqual({ ok: true });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/example",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("honors an explicitly injected base URL", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true }));

    await fetchJson("/api/example", responseSchema, {
      baseUrl: "https://injected.example/base",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://injected.example/api/example",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("leaves an absolute request URL unchanged", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true }));

    await fetchJson("https://api.example/resource", responseSchema, {
      baseUrl: "https://ignored.example",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example/resource",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
