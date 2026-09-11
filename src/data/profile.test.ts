import { describe, expect, it, vi } from "vitest";
import { ApiResponseValidationError } from "./api-core";
import { getProfileOverview } from "./profile";

const overview = {
  drillCount: 3,
  favouriteCount: 2,
  drillBackInCount: 1,
  trainingMethods: [{
    id: "22222222-2222-4222-8222-222222222222",
    name: "Pad Work",
    slug: "pad-work",
    iconKey: "pad-work",
    count: 2,
  }],
};

describe("profile overview client", () => {
  it("loads and unwraps the dedicated overview response", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ overview }));

    await expect(getProfileOverview({
      baseUrl: "https://example.test",
      fetcher,
    })).resolves.toEqual(overview);
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.test/api/profile/overview",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects invalid aggregate counts at the data boundary", async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      overview: { ...overview, favouriteCount: -1 },
    }));

    await expect(getProfileOverview({
      baseUrl: "https://example.test",
      fetcher,
    })).rejects.toBeInstanceOf(ApiResponseValidationError);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
