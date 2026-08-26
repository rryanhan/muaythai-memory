import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeCaptureRateLimit: vi.fn(),
  generate: vi.fn(),
  getTaxonomy: vi.fn(),
}));

vi.mock("@/modules/taxonomy/queries", () => ({
  getTaxonomy: mocks.getTaxonomy,
}));
vi.mock("./providers", () => ({
  getCaptureDraftProvider: () => ({ generate: mocks.generate }),
}));
vi.mock("./rate-limits", () => ({
  consumeCaptureRateLimit: mocks.consumeCaptureRateLimit,
}));

import { generateCaptureDraft } from "./draft";

const userId = "00000000-0000-4000-8000-000000000001";
const transcript = "On pads, throw a jab, cross, and rear kick before resetting.";

describe("capture cleanup dispatch ordering", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getTaxonomy.mockResolvedValue({
      trainingMethods: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          name: "Pad Work",
          slug: "pad-work",
          iconKey: "pad-work",
          sortOrder: 1,
        },
      ],
      tagCategories: [],
      standardTags: [
        {
          id: "00000000-0000-4000-8000-000000000003",
          name: "Cross",
          slug: "cross",
          categoryId: null,
          categorySlug: null,
          categoryName: null,
          kind: "standard",
        },
      ],
      customTags: [],
      statusTags: [],
    });
    mocks.consumeCaptureRateLimit.mockResolvedValue(undefined);
    mocks.generate.mockResolvedValue({
      title: "Jab Cross Rear Kick",
      summary: "Practice a jab-cross combination into a rear kick.",
      notes: null,
      steps: ["Throw the jab.", "Throw the cross.", "Throw the rear kick."],
      trainingMethodSlugs: ["pad-work"],
      tagSlugs: ["cross"],
    });
  });

  it("checks and consumes quota immediately before provider dispatch", async () => {
    await generateCaptureDraft(userId, transcript);

    expect(mocks.consumeCaptureRateLimit).toHaveBeenCalledWith(userId, "cleanup");
    expect(mocks.consumeCaptureRateLimit.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.generate.mock.invocationCallOrder[0]);
  });

  it("never reaches the provider after quota rejection", async () => {
    mocks.consumeCaptureRateLimit.mockRejectedValue(new Error("quota blocked"));

    await expect(generateCaptureDraft(userId, transcript)).rejects.toThrow("quota blocked");
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("still counts a dispatched attempt when the provider fails", async () => {
    mocks.generate.mockRejectedValue(new Error("provider failed"));

    await expect(generateCaptureDraft(userId, transcript)).rejects.toThrow("provider failed");
    expect(mocks.consumeCaptureRateLimit).toHaveBeenCalledTimes(1);
  });
});
