import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StatusTagDto } from "@/data";
import { SavedListActions } from "./SavedListActions";

vi.mock("@/data/drills", () => ({
  updateDrillSavedList: vi.fn(),
}));

describe("SavedListActions server state synchronization", () => {
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
});

const starredStatus: StatusTagDto = {
  id: "status-starred",
  name: "Favourite",
  slug: "starred",
  sortOrder: 10,
};
