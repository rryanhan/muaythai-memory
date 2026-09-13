import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaxonomyResponse } from "@/data/types";

const mocks = vi.hoisted(() => ({
  addDrillPageForm: vi.fn(),
  getTaxonomy: vi.fn(),
  requireCurrentPageUserId: vi.fn(),
  requireProfileOnboardedPageUserId: vi.fn(),
}));

vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: () => <nav aria-label="Bottom navigation" />,
}));
vi.mock("@/features/drills/DrillDetailBackButton", () => ({
  DrillDetailBackButton: () => <button type="button">Back</button>,
}));
vi.mock("@/features/drills/AddDrillPageForm", () => ({
  AddDrillPageForm: (props: Record<string, unknown>) => {
    mocks.addDrillPageForm(props);
    return <div>Drill form</div>;
  },
}));
vi.mock("@/features/onboarding/FirstDrillCommitContext", () => ({
  FirstDrillCommitProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/modules/auth/page-user", () => ({
  requireCurrentPageUserId: mocks.requireCurrentPageUserId,
  requireProfileOnboardedPageUserId: mocks.requireProfileOnboardedPageUserId,
}));
vi.mock("@/modules/taxonomy/queries", () => ({
  getTaxonomy: mocks.getTaxonomy,
}));

import AddDrillPage from "./page";

const userId = "00000000-0000-4000-8000-000000000002";
const taxonomyFixture: TaxonomyResponse = {
  trainingMethods: [],
  tagCategories: [],
  standardTags: [],
  customTags: [],
  statusTags: [],
};

describe("AddDrillPage taxonomy data", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireCurrentPageUserId.mockResolvedValue(userId);
    mocks.getTaxonomy.mockResolvedValue(taxonomyFixture);
  });

  it("loads taxonomy for the authenticated user and seeds the form", async () => {
    render(await AddDrillPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Drill form")).toBeInTheDocument();
    expect(mocks.requireCurrentPageUserId).toHaveBeenCalledWith("/drills/new");
    expect(mocks.getTaxonomy).toHaveBeenCalledWith(userId);
    expect(mocks.addDrillPageForm).toHaveBeenCalledWith(expect.objectContaining({
      fromJournal: false,
      initialTaxonomy: taxonomyFixture,
      onboarding: false,
    }));
  });

  it("falls back to the form's client query when preloading fails", async () => {
    const error = new Error("database unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getTaxonomy.mockRejectedValueOnce(error);

    try {
      render(await AddDrillPage({ searchParams: Promise.resolve({}) }));

      expect(screen.getByText("Drill form")).toBeInTheDocument();
      expect(mocks.addDrillPageForm).toHaveBeenCalledWith(expect.objectContaining({
        initialTaxonomy: undefined,
      }));
      expect(consoleError).toHaveBeenCalledWith(
        "Could not preload the new-drill taxonomy.",
        error,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
