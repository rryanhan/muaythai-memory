import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StatusTagDto } from "@/data";
import { updateDrillSavedList } from "@/data/drills";
import { SavedListActions } from "./SavedListActions";

vi.mock("@/data/drills", () => ({
  updateDrillSavedList: vi.fn(),
}));

describe("SavedListActions server state synchronization", () => {
  beforeEach(() => {
    vi.mocked(updateDrillSavedList).mockReset();
  });

  it("updates button selection when fresh status props arrive for the same drill", () => {
    const queryClient = new QueryClient();
    const renderActions = (statusTags: StatusTagDto[]) => (
      <QueryClientProvider client={queryClient}>
        <SavedListActions drillId="drill-1" statusTags={statusTags} />
      </QueryClientProvider>
    );
    const view = render(renderActions([]));

    expect(screen.getByRole("button", { name: "Add to Favourite" }))
      .toHaveAttribute("aria-pressed", "false");

    view.rerender(renderActions([starredStatus]));
    expect(screen.getByRole("button", { name: "Remove from Favourite" }))
      .toHaveAttribute("aria-pressed", "true");

    view.rerender(renderActions([]));
    expect(screen.getByRole("button", { name: "Add to Favourite" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("invalidates the profile overview after a saved-list change", async () => {
    vi.mocked(updateDrillSavedList).mockResolvedValue({
      drillId: "00000000-0000-4000-8000-000000000101",
      selected: true,
      status: starredStatus,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["profile", "overview"], {
      drillCount: 1,
      favouriteCount: 0,
      drillBackInCount: 0,
      trainingMethods: [],
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SavedListActions drillId="drill-1" statusTags={[]} />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Add to Favourite" }));

    await waitFor(() => {
      expect(queryClient.getQueryState(["profile", "overview"])?.isInvalidated).toBe(true);
    });
    expect(updateDrillSavedList).toHaveBeenCalledWith("drill-1", {
      slug: "starred",
      selected: true,
    });
  });
});

const starredStatus: StatusTagDto = {
  id: "status-starred",
  name: "Favourite",
  slug: "starred",
  sortOrder: 10,
};
