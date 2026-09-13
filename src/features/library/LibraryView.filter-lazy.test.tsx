import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrillListResponse } from "@/data";

const mocks = vi.hoisted(() => ({
  getDrills: vi.fn(),
  getTaxonomy: vi.fn(),
}));

const lazyFilterSheet = vi.hoisted(() => {
  let resolve!: () => void;
  const gate = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { gate, loadStarted: vi.fn(), resolve };
});

vi.mock("@/data/drills", () => ({
  getDrills: mocks.getDrills,
}));
vi.mock("@/data/taxonomy", () => ({
  getTaxonomy: mocks.getTaxonomy,
}));
vi.mock("./LibraryFilterSheet", async (importOriginal) => {
  lazyFilterSheet.loadStarted();
  await lazyFilterSheet.gate;
  return importOriginal<typeof import("./LibraryFilterSheet")>();
});

import { LibraryView } from "./LibraryView";

afterAll(() => lazyFilterSheet.resolve());

describe("LibraryView deferred filter sheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDrills.mockResolvedValue(emptyDrillResponse);
    mocks.getTaxonomy.mockResolvedValue({
      trainingMethods: [],
      tagCategories: [],
      standardTags: [],
      customTags: [],
      statusTags: [],
    });
  });

  it("hands focus from the actionable fallback into the real loaded sheet", async () => {
    const user = userEvent.setup();
    renderLibrary();

    const trigger = screen.getByRole("button", { name: "Filter by tags" });
    await user.click(trigger);

    const fallbackDialog = await screen.findByRole("dialog", { name: "Filter Drills" });
    expect(lazyFilterSheet.loadStarted).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Loading filters…");
    expect(within(fallbackDialog).getByRole("button", { name: "Close" })).toHaveFocus();

    await act(async () => {
      lazyFilterSheet.resolve();
      await lazyFilterSheet.gate;
    });

    let loadedDialog: HTMLElement | undefined;
    await waitFor(() => {
      loadedDialog = screen
        .getAllByRole("dialog", { name: "Filter Drills" })
        .find((dialog) => dialog.hasAttribute("data-vaul-drawer"));
      expect(loadedDialog).toBeDefined();
    });
    if (!loadedDialog) throw new Error("The real filter sheet did not replace its fallback.");

    const loadedClose = within(loadedDialog).getByRole("button", { name: "Close" });
    await waitFor(() => expect(loadedClose).toHaveFocus());
    expect(loadedDialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getAllByRole("dialog", { name: "Filter Drills" })).toEqual([loadedDialog]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.click(loadedClose);
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

function renderLibrary() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <LibraryView />
    </QueryClientProvider>,
  );
}

const emptyDrillResponse: DrillListResponse = {
  drills: [],
  total: 0,
  filters: {
    keywords: [],
    methodSlugs: [],
    tagSlugs: [],
    statusTagSlugs: [],
    tagMode: "all",
    statusMode: "all",
  },
};
