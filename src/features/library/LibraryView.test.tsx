import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrillListResponse } from "@/data";
import { LibraryView } from "./LibraryView";

const mocks = vi.hoisted(() => ({
  getDrills: vi.fn(),
  getTaxonomy: vi.fn(),
  indexPanelRequested: vi.fn(),
}));

const lazyModules = vi.hoisted(() => {
  let resolveIndexPanel!: () => void;
  const indexPanelGate = new Promise<void>((resolve) => {
    resolveIndexPanel = resolve;
  });

  return { indexPanelGate, resolveIndexPanel };
});

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
vi.mock("./LibraryIndexPanel", async () => {
  mocks.indexPanelRequested();
  await lazyModules.indexPanelGate;
  return {
    LibraryIndexPanel: () => <div data-testid="library-index-panel" />,
  };
});

afterAll(() => {
  lazyModules.resolveIndexPanel();
});

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
    expect(mocks.getTaxonomy).not.toHaveBeenCalled();
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

  it("defers the index panel while keeping its cold dialog actionable", async () => {
    mocks.getDrills.mockResolvedValue(emptyDrillResponse);
    const user = userEvent.setup();
    const { container } = renderLibrary();
    const trigger = screen.getByRole("button", { name: "Open Training Method index" });
    expect(mocks.indexPanelRequested).not.toHaveBeenCalled();
    expect(mocks.getTaxonomy).not.toHaveBeenCalled();

    await user.click(trigger);
    await waitFor(() => expect(mocks.getTaxonomy).toHaveBeenCalledOnce());
    expect(mocks.getTaxonomy).toHaveBeenCalledWith({
      requestInit: { signal: expect.any(AbortSignal) },
    });

    const dialog = await screen.findByRole("dialog", { name: "Training Method index" });
    const close = screen.getByRole("button", { name: "Close" });
    expect(mocks.indexPanelRequested).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Loading method index…");
    expect(screen.queryByTestId("library-index-panel")).not.toBeInTheDocument();
    expect(dialog.parentElement).toBe(document.body);
    expect(container).toHaveAttribute("inert", "");
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.getPropertyValue("overflow")).toBe("hidden");
    await waitFor(() => expect(close).toHaveFocus());

    await user.click(close);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Training Method index" })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
    expect(container).not.toHaveAttribute("inert");
    expect(container).not.toHaveAttribute("aria-hidden");

    await user.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Training Method index" })).toBeInTheDocument();
    await act(async () => {
      lazyModules.resolveIndexPanel();
      await lazyModules.indexPanelGate;
    });
    expect(await screen.findByTestId("library-index-panel")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Training Method index" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("reuses the active drill request when an unchanged filter preview opens", async () => {
    const request = deferred<DrillListResponse>();
    mocks.getDrills.mockReturnValue(request.promise);
    const user = userEvent.setup();
    renderLibrary();

    await waitFor(() => expect(mocks.getDrills).toHaveBeenCalledOnce());
    expect(screen.queryByTestId("library-filter-sheet")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filter by tags" }));
    await waitFor(() => {
      expect(screen.getByTestId("library-filter-sheet")).toHaveAttribute("data-open", "true");
    });

    expect(mocks.getDrills).toHaveBeenCalledOnce();

    request.resolve(emptyDrillResponse);
    expect(await screen.findByText("No drills found")).toBeInTheDocument();
  });

  it("requests taxonomy only after a taxonomy-dependent surface opens", async () => {
    mocks.getDrills.mockResolvedValue(emptyDrillResponse);
    const user = userEvent.setup();
    renderLibrary();

    expect(await screen.findByText("No drills found")).toBeInTheDocument();
    expect(mocks.getDrills).toHaveBeenCalledOnce();
    expect(mocks.getTaxonomy).not.toHaveBeenCalled();

    const trigger = screen.getByRole("button", { name: "Filter by tags" });
    await user.click(trigger);
    await waitFor(() => expect(mocks.getTaxonomy).toHaveBeenCalledOnce());
    expect(mocks.getTaxonomy).toHaveBeenCalledWith({
      requestInit: { signal: expect.any(AbortSignal) },
    });

    await user.click(trigger);
    await user.click(trigger);
    expect(mocks.getTaxonomy).toHaveBeenCalledOnce();
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
