import { afterEach, describe, expect, it, vi } from "vitest";
import { createOnboardingFirstDrill } from "./onboarding";

const input = {
  title: "Slip and return",
  summary: "",
  notes: null,
  steps: ["Slip outside the cross.", "Return with the uppercut."],
  trainingMethodSlugs: ["pad-work"],
  tagSlugs: [],
  statusTagSlugs: [],
};

const drillResponse = {
  drill: {
    id: "00000000-0000-4000-8000-000000000101",
    title: input.title,
    summary: "",
    notes: null,
    steps: [
      {
        id: "00000000-0000-4000-8000-000000000201",
        position: 1,
        body: input.steps[0],
      },
      {
        id: "00000000-0000-4000-8000-000000000202",
        position: 2,
        body: input.steps[1],
      },
    ],
    trainingMethods: [
      {
        id: "00000000-0000-4000-8000-000000000301",
        name: "Pad Work",
        slug: "pad-work",
        iconKey: "pad-work",
        sortOrder: 1,
      },
    ],
    tags: [],
    customTags: [],
    statusTags: [],
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  },
};

describe("onboarding first-drill client", () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("reuses one key after response loss and rotates it only after a confirmed response", async () => {
    const keys: string[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const key = new Headers(init?.headers).get("idempotency-key");
      if (!key) throw new Error("Missing idempotency key.");
      keys.push(key);

      if (keys.length === 1) throw new TypeError("Simulated response loss.");
      return new Response(JSON.stringify(drillResponse), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });

    await expect(createOnboardingFirstDrill(input, { fetcher })).rejects.toThrow(
      "Simulated response loss",
    );
    await expect(createOnboardingFirstDrill(input, { fetcher })).resolves.toMatchObject({
      id: drillResponse.drill.id,
    });
    await createOnboardingFirstDrill(input, { fetcher });

    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});
