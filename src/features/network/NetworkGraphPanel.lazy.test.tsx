import { type ComponentProps, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { GraphOptions, GraphResponse } from "@/data/types";
import { defaultNetworkLayerOptions, emptyNetworkFilters } from "./types";

const mocks = vi.hoisted(() => ({
  getDrill: vi.fn(() => new Promise(() => undefined)),
  linkProps: vi.fn(),
}));

const lazyModules = vi.hoisted(() => {
  function createGate() {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });

    return { promise, release };
  }

  return {
    controls: createGate(),
    controlsRequested: vi.fn(),
    detail: createGate(),
    detailRequested: vi.fn(),
  };
});

vi.mock("@/data/drills", () => ({ getDrill: mocks.getDrill }));
vi.mock("next/link", () => ({
  default: ({
    children,
    prefetch,
    ...props
  }: ComponentProps<"a"> & { prefetch?: boolean | "auto" | null }) => {
    mocks.linkProps({ href: props.href, prefetch });
    return <a {...props}>{children}</a>;
  },
}));
vi.mock("./NetworkForceGraph", () => ({
  NetworkForceGraph: ({ active, onDrillSelect }: {
    active: boolean;
    onDrillSelect: (id: string) => void;
  }) => (
    <div data-testid="force-graph" data-active={String(active)}>
      <svg aria-label="Fixture graph">
        <g data-testid="fixture-drill-node" onPointerUp={() => onDrillSelect(drillId)}>
          <circle cx="10" cy="10" r="8" />
        </g>
      </svg>
    </div>
  ),
}));
vi.mock("./NetworkControlsSheet", async (importOriginal) => {
  lazyModules.controlsRequested();
  await lazyModules.controls.promise;
  return importOriginal<typeof import("./NetworkControlsSheet")>();
});
vi.mock("@/features/drills/DrillDetailSheet", async (importOriginal) => {
  lazyModules.detailRequested();
  await lazyModules.detail.promise;
  return importOriginal<typeof import("@/features/drills/DrillDetailSheet")>();
});

afterAll(() => {
  lazyModules.controls.release();
  lazyModules.detail.release();
});

import { NetworkGraphPanel } from "./NetworkGraphPanel";

const drillId = "00000000-0000-4000-8000-000000000001";
const graph = {
  nodes: [
    {
      id: "method:pad-work",
      entityId: "00000000-0000-4000-8000-000000000002",
      type: "trainingMethod",
      label: "Pad Work",
      slug: "pad-work",
      active: false,
      matched: false,
      selected: false,
      iconKey: "pad-work",
    },
    {
      id: `drill:${drillId}`,
      entityId: drillId,
      type: "drill",
      label: "Fixture drill",
      active: false,
      matched: false,
      selected: false,
    },
  ],
  edges: [],
  filters: emptyNetworkFilters,
  options: defaultNetworkLayerOptions,
} as GraphResponse;

describe("NetworkGraphPanel cold sheet loading", () => {
  it("keeps both sheets operable and moves focus into each real dialog after its chunk resolves", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Harness active />
      </QueryClientProvider>,
    );

    const controlsTrigger = screen.getByRole("button", { name: "Network controls" });
    await user.click(controlsTrigger);
    let fallbackDialog = await screen.findByRole("dialog", { name: "Network Controls" });
    expect(lazyModules.controlsRequested).toHaveBeenCalledOnce();
    expect(within(fallbackDialog).getByRole("status")).toHaveTextContent("Loading network controls…");
    expect(within(fallbackDialog).getByRole("button", { name: "Close" })).toHaveFocus();

    fireEvent.keyDown(fallbackDialog, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Network Controls" })).not.toBeInTheDocument();
      expect(controlsTrigger).toHaveFocus();
    });

    await user.click(controlsTrigger);
    expect(await screen.findByRole("dialog", { name: "Network Controls" })).toBeInTheDocument();
    await act(async () => {
      lazyModules.controls.release();
      await lazyModules.controls.promise;
    });

    await waitFor(() => expect(screen.queryByText("Loading network controls…")).not.toBeInTheDocument());
    const controlsDialog = screen.getByRole("dialog", { name: "Network Controls" });
    expect(controlsDialog).toHaveAttribute("data-vaul-drawer");
    expect(controlsDialog).toHaveAttribute("role", "dialog");
    expect(controlsDialog).not.toHaveAttribute("aria-hidden");
    const loadedControlsClose = within(controlsDialog).getByRole("button", { name: "Close" });
    await waitFor(() => expect(loadedControlsClose).toHaveFocus());
    expect(controlsTrigger).not.toHaveFocus();

    fireEvent.click(loadedControlsClose);
    await waitFor(() => expect(controlsTrigger).toHaveFocus());

    const drillNode = screen.getByTestId("fixture-drill-node");
    fireEvent.pointerUp(drillNode);
    fallbackDialog = await screen.findByRole("dialog", { name: "Drill Detail" });
    expect(lazyModules.detailRequested).toHaveBeenCalledOnce();
    expect(within(fallbackDialog).getByRole("status")).toHaveTextContent("Loading drill details…");
    expect(drillNode).not.toHaveFocus();

    fireEvent.keyDown(fallbackDialog, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Drill Detail" })).not.toBeInTheDocument();
      expect(controlsTrigger).toHaveFocus();
    });

    fireEvent.pointerUp(drillNode);
    expect(await screen.findByRole("dialog", { name: "Drill Detail" })).toBeInTheDocument();
    await act(async () => {
      lazyModules.detail.release();
      await lazyModules.detail.promise;
    });

    await waitFor(() => expect(screen.queryByText("Loading drill details…")).not.toBeInTheDocument());
    const detailDialog = screen.getByRole("dialog", { name: "Drill Detail" });
    expect(detailDialog).toHaveAttribute("data-vaul-drawer");
    expect(detailDialog).toHaveAttribute("role", "dialog");
    expect(detailDialog).not.toHaveAttribute("aria-hidden");
    const detailHeading = within(detailDialog).getByText("Drill Detail");
    await waitFor(() => expect(detailHeading).toHaveFocus());
    expect(detailHeading).toHaveAttribute("tabindex", "-1");
    expect(controlsTrigger).not.toHaveFocus();
    expect(within(detailDialog).getByRole("heading", { name: "Loading drill" })).toBeInTheDocument();
  });
});

function Harness({ active }: { active: boolean }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [filters, setFilters] = useState(emptyNetworkFilters);
  const [layerOptions, setLayerOptions] = useState<GraphOptions>(defaultNetworkLayerOptions);

  return (
    <NetworkGraphPanel
      active={active}
      graph={graph}
      filters={filters}
      effectiveFilters={filters}
      layerOptions={layerOptions}
      previewKeyword=""
      searchOpen={searchOpen}
      searchDraft={searchDraft}
      refreshing={false}
      onRetry={() => undefined}
      onSearchOpenChange={setSearchOpen}
      onSearchDraftChange={setSearchDraft}
      onUpdateFilters={(updater) => setFilters((current) => updater(current))}
      onLayerOptionsChange={setLayerOptions}
    />
  );
}
