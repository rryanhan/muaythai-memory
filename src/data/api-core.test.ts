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

describe("API request headers", () => {
  it("combines the JSON accept default with record-shaped client headers", async () => {
    let requestHeaders: HeadersInit | undefined;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestHeaders = init?.headers;
      return jsonResponse({ ok: true });
    });

    await fetchJson("/api/example", responseSchema, {
      fetcher,
      headers: { Authorization: "Bearer client-token" },
    });

    const headers = new Headers(requestHeaders);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer client-token");
  });

  it("supports Headers instances and applies request headers after client headers", async () => {
    let requestHeaders: HeadersInit | undefined;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestHeaders = init?.headers;
      return jsonResponse({ ok: true });
    });

    await fetchJson(
      "/api/example",
      responseSchema,
      {
        fetcher,
        headers: new Headers({
          Accept: "application/vnd.client+json",
          "X-Layer": "client",
        }),
      },
      {
        headers: new Headers({
          aCcEpT: "application/vnd.request+json",
          "x-layer": "request",
        }),
      },
    );

    const headers = new Headers(requestHeaders);
    expect(headers.get("accept")).toBe("application/vnd.request+json");
    expect(headers.get("x-layer")).toBe("request");
    expect([...headers.keys()].filter((name) => name === "accept")).toHaveLength(1);
  });

  it("supports tuple arrays and overrides content types case-insensitively", async () => {
    let requestHeaders: HeadersInit | undefined;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestHeaders = init?.headers;
      return jsonResponse({ ok: true });
    });

    await fetchJson(
      "/api/example",
      responseSchema,
      {
        fetcher,
        headers: [
          ["Content-Type", "application/json"],
          ["X-Layer", "client"],
        ],
      },
      {
        method: "PATCH",
        headers: [
          ["content-type", "application/merge-patch+json"],
          ["x-layer", "request"],
        ],
        body: "{}",
      },
    );

    const headers = new Headers(requestHeaders);
    expect(headers.get("content-type")).toBe("application/merge-patch+json");
    expect(headers.get("x-layer")).toBe("request");
    expect([...headers.keys()].filter((name) => name === "content-type")).toHaveLength(1);
  });

  it("does not add a content type to FormData bodies", async () => {
    let requestInit: RequestInit | undefined;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestInit = init;
      return jsonResponse({ ok: true });
    });
    const body = new FormData();
    body.set("video", new Blob(["video"]), "clip.mp4");

    await fetchJson("/api/example", responseSchema, { fetcher }, {
      method: "POST",
      body,
    });

    expect(requestInit?.body).toBe(body);
    expect(new Headers(requestInit?.headers).has("content-type")).toBe(false);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
