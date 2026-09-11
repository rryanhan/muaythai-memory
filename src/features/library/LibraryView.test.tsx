import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrillListResponse } from "@/data";
import { LibraryView } from "./LibraryView";

const mocks = vi.hoisted(() => ({
  getDrills: vi.fn(),
  getTaxonomy: vi.fn(),
}));

vi.mock("@/data/drills", () => ({
  getDrills: mocks.getDrills,
}));
vi.mock("@/data/taxonomy", () => ({
  getTaxonomy: mocks.getTaxonomy,
}));
vi.mock("./LibraryFilterSheet", () => ({
  LibraryFilterSheet: ({ open }: { open: boolean }) => (
    <div data-testid="library-filter-sheet" data-open={open} />
  ),
}));

describe("LibraryView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTaxonomy.mockResolvedValue({
      trainingMethods: [],
      tagCategories: [],
      standardTags: [],
      customTags: [],
      statusTags: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for rapid keyword typing to settle before requesting drills", async () => {
    vi.useFakeTimers();
    mocks.getDrills.mockResolvedValue(emptyDrillResponse);
    renderLibrary();

    expect(mocks.getDrills).toHaveBeenCalledOnce();
    const searchInput = screen.getByRole("textbox", { name: "Search drills by keyword" });
    fireEvent.change(searchInput, { target: { value: "m" } });
    fireEvent.change(searchInput, { target: { value: "mu" } });
    fireEvent.change(searchInput, { target: { value: "muay" } });

    expect(searchInput).toHaveValue("muay");
    expect(mocks.getDrills).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(249);
    });
    expect(mocks.getDrills).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.getDrills).toHaveBeenCalledTimes(2);
    expect(mocks.getDrills.mock.calls[1]?.[0]).toMatchObject({ keywords: ["muay"] });
  });

  it("cancels a pending keyword request when the input is cleared", async () => {
    vi.useFakeTimers();
    mocks.getDrills.mockResolvedValue(emptyDrillResponse);
    renderLibrary();

    const searchInput = screen.getByRole("textbox", { name: "Search drills by keyword" });
    fireEvent.change(searchInput, { target: { value: "muay" } });
    fireEvent.change(searchInput, { target: { value: "" } });

    expect(searchInput).toHaveValue("");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.getDrills).toHaveBeenCalledOnce();
    expect(mocks.getDrills.mock.calls[0]?.[0]).toMatchObject({ keywords: [] });
  });

  it("reuses the active drill request when an unchanged filter preview opens", async () => {
    const request = deferred<DrillListResponse>();
    mocks.getDrills.mockReturnValue(request.promise);
    const user = userEvent.setup();
    renderLibrary();

    await waitFor(() => expect(mocks.getDrills).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Filter by tags" }));
    await waitFor(() => {
      expect(screen.getByTestId("library-filter-sheet")).toHaveAttribute("data-open", "true");
    });

    expect(mocks.getDrills).toHaveBeenCalledOnce();

    request.resolve(emptyDrillResponse);
    expect(await screen.findByText("No drills found")).toBeInTheDocument();
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
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
