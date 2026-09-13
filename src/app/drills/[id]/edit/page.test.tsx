import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaxonomyResponse } from "@/data/types";

const mocks = vi.hoisted(() => ({
  addDrillForm: vi.fn(),
  getDrillById: vi.fn(),
  getTaxonomy: vi.fn(),
  requireCurrentPageUserId: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/components/navigation/RoutedBottomNav", () => ({
  RoutedBottomNav: () => <nav aria-label="Bottom navigation" />,
}));
vi.mock("@/features/drills/DrillDetailBackButton", () => ({
  DrillDetailBackButton: () => <button type="button">Back</button>,
}));
vi.mock("@/features/drills/AddDrillForm", () => ({
  AddDrillForm: (props: Record<string, unknown>) => {
    mocks.addDrillForm(props);
    return <div>Edit form</div>;
  },
}));
vi.mock("@/features/drills/DeleteDrillSection", () => ({
  DeleteDrillSection: () => null,
}));
vi.mock("@/modules/auth/page-user", () => ({
  requireCurrentPageUserId: mocks.requireCurrentPageUserId,
}));
vi.mock("@/modules/drills/queries", () => ({
  getDrillById: mocks.getDrillById,
}));
vi.mock("@/modules/taxonomy/queries", () => ({
  getTaxonomy: mocks.getTaxonomy,
}));

import EditDrillPage from "./page";

const drillId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const drill = { id: drillId, title: "Rear kick" };
const taxonomyFixture: TaxonomyResponse = {
  trainingMethods: [],
  tagCategories: [],
  standardTags: [],
  customTags: [],
  statusTags: [],
};

describe("EditDrillPage taxonomy data", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireCurrentPageUserId.mockResolvedValue(userId);
    mocks.getDrillById.mockResolvedValue(drill);
    mocks.getTaxonomy.mockResolvedValue(taxonomyFixture);
  });

  it("loads the drill and taxonomy for the authenticated user", async () => {
    render(await EditDrillPage({ params: Promise.resolve({ id: drillId }) }));

    expect(screen.getByText("Edit form")).toBeInTheDocument();
    expect(mocks.requireCurrentPageUserId).toHaveBeenCalledWith(`/drills/${drillId}/edit`);
    expect(mocks.getDrillById).toHaveBeenCalledWith(userId, drillId);
    expect(mocks.getTaxonomy).toHaveBeenCalledWith(userId);
    expect(mocks.addDrillForm).toHaveBeenCalledWith(expect.objectContaining({
      initialDrill: drill,
      initialTaxonomy: taxonomyFixture,
      mode: "edit",
    }));
  });
});
