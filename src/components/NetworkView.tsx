"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ApiError,
  ApiResponseValidationError,
  getDrill,
  getGraph,
  type DrillDetail,
  type DrillFilterInput,
  type GraphNode,
  type GraphResponse,
} from "@/data";
import { badgeByIconKey } from "@/components/context-badges";
import { DrillDetailSheet } from "@/components/drills/DrillDetailSheet";
import { NetworkForceGraph } from "@/components/network/NetworkForceGraph";

type NetworkLoadState =
  | { status: "loading" }
  | { status: "loaded"; graph: GraphResponse; refreshing: boolean; errorMessage?: string }
  | { status: "error"; message: string };

type NetworkViewProps = {
  initialGraph?: GraphResponse;
};

type NetworkFilters = {
  methodSlug: string | null;
  keywords: string[];
};

type DrillDetailLoadState =
  | { status: "idle" }
  | { status: "loading"; drillId: string }
  | { status: "loaded"; drill: DrillDetail }
  | { status: "error"; drillId: string; message: string };

const methodOrder = ["pad-work", "bag-work", "partner-drill", "clinch", "technical-work"];

const emptyFilters: NetworkFilters = {
  methodSlug: null,
  keywords: [],
};

const graphLayerOptions = {
  showTags: false,
  showCustomTags: false,
  showStatusTags: false,
};

export function NetworkView({ initialGraph }: NetworkViewProps) {
  const [filters, setFilters] = useState<NetworkFilters>(emptyFilters);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [loadState, setLoadState] = useState<NetworkLoadState>(() =>
    initialGraph ? { status: "loaded", graph: initialGraph, refreshing: false } : { status: "loading" },
  );
  const previewKeyword = searchOpen ? normalizeKeyword(searchDraft) : "";
  const effectiveFilters = useMemo(
    () => addPreviewKeyword(filters, previewKeyword),
    [filters, previewKeyword],
  );
  const filterKey = useMemo(() => buildFilterKey(effectiveFilters), [effectiveFilters]);

  const retryGraph = useCallback(() => {
    setRetryNonce((current) => current + 1);
  }, []);

  const updateFilters = useCallback((updater: (current: NetworkFilters) => NetworkFilters) => {
    setFilters((current) => normalizeNetworkFilters(updater(current)));
  }, []);

  useEffect(() => {
    if (isEmptyFilterSet(effectiveFilters) && initialGraph) {
      setLoadState({ status: "loaded", graph: initialGraph, refreshing: false });
      return;
    }

    const controller = new AbortController();

    setLoadState((current) => {
      if (current.status === "loaded") {
        return { ...current, refreshing: true, errorMessage: undefined };
      }

      return { status: "loading" };
    });

    getGraph(toDrillFilters(effectiveFilters), graphLayerOptions, { requestInit: { signal: controller.signal } })
      .then((graph) => setLoadState({ status: "loaded", graph, refreshing: false }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        const message = getNetworkErrorMessage(error);
        setLoadState((current) => {
          if (current.status === "loaded") {
            return { ...current, refreshing: false, errorMessage: message };
          }

          return { status: "error", message };
        });
      });

    return () => controller.abort();
  }, [filterKey, initialGraph, retryNonce]);

  return (
    <section className="network-view" aria-label="Network view">
      {loadState.status === "loading" && (
        <NetworkStatePanel title="Loading network" body="Building the drill map from the graph API." />
      )}

      {loadState.status === "error" && (
        <NetworkStatePanel title="Network unavailable" body={loadState.message}>
          <button type="button" onClick={retryGraph}>
            Retry
          </button>
        </NetworkStatePanel>
      )}

      {loadState.status === "loaded" && (
        <NetworkGraph
          graph={loadState.graph}
          filters={filters}
          effectiveFilters={effectiveFilters}
          previewKeyword={previewKeyword}
          searchOpen={searchOpen}
          searchDraft={searchDraft}
          refreshing={loadState.refreshing}
          errorMessage={loadState.errorMessage}
          onRetry={retryGraph}
          onSearchOpenChange={setSearchOpen}
          onSearchDraftChange={setSearchDraft}
          onUpdateFilters={updateFilters}
        />
      )}
    </section>
  );
}

function NetworkGraph({
  graph,
  filters,
  effectiveFilters,
  previewKeyword,
  searchOpen,
  searchDraft,
  refreshing,
  errorMessage,
  onRetry,
  onSearchOpenChange,
  onSearchDraftChange,
  onUpdateFilters,
}: {
  graph: GraphResponse;
  filters: NetworkFilters;
  effectiveFilters: NetworkFilters;
  previewKeyword: string;
  searchOpen: boolean;
  searchDraft: string;
  refreshing: boolean;
  errorMessage?: string;
  onRetry: () => void;
  onSearchOpenChange: (open: boolean) => void;
  onSearchDraftChange: (value: string) => void;
  onUpdateFilters: (updater: (current: NetworkFilters) => NetworkFilters) => void;
}) {
  const [controlsOpen, setControlsOpen] = useState(false);
  const [selectedDrillId, setSelectedDrillId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRetryNonce, setDetailRetryNonce] = useState(0);
  const [detailLoadState, setDetailLoadState] = useState<DrillDetailLoadState>({ status: "idle" });
  const methods = useMemo(() => sortMethods(graph.nodes.filter((node) => node.type === "trainingMethod")), [graph]);
  const drills = useMemo(() => graph.nodes.filter((node) => node.type === "drill"), [graph]);
  const drillCount = drills.length;
  const activeDrillCount = drills.filter((node) => node.active).length;
  const hasFilters = hasActiveFilters(filters);
  const hasVisibleFilters = hasActiveFilters(effectiveFilters);
  const previewIsCommitted = Boolean(previewKeyword && filters.keywords.includes(previewKeyword));
  const graphHasFilters = hasGraphFilters(graph);
  const graphMatchesFilters = graphFiltersMatchNetworkFilters(graph.filters, effectiveFilters);
  const graphCanHighlight = graphHasFilters && graphMatchesFilters;
  const selectedMethod = filters.methodSlug
    ? methods.find((method) => method.slug === filters.methodSlug)
    : undefined;
  const selectedMethodCount = graphMatchesFilters ? ` (${activeDrillCount})` : "";

  useEffect(() => {
    if (!selectedDrillId) {
      setDetailLoadState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setDetailLoadState({ status: "loading", drillId: selectedDrillId });

    getDrill(selectedDrillId, { requestInit: { signal: controller.signal } })
      .then((drill) => {
        if (!controller.signal.aborted) {
          setDetailLoadState({ status: "loaded", drill });
        }
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        if (!controller.signal.aborted) {
          setDetailLoadState({
            status: "error",
            drillId: selectedDrillId,
            message: getDrillDetailErrorMessage(error),
          });
        }
      });

    return () => controller.abort();
  }, [detailRetryNonce, selectedDrillId]);

  if (methods.length === 0 && drillCount === 0) {
    return <NetworkStatePanel title="No graph data" body="No Training Method or drill nodes were returned." />;
  }

  function applySearchDraft() {
    const keyword = normalizeKeyword(searchDraft);
    if (!keyword) {
      onSearchOpenChange(false);
      onSearchDraftChange("");
      return;
    }

    onUpdateFilters((current) => ({
      ...current,
      keywords: [...current.keywords, keyword],
    }));
    onSearchDraftChange("");
    onSearchOpenChange(false);
  }

  function toggleSearch() {
    if (searchOpen && searchDraft.trim()) {
      applySearchDraft();
      return;
    }

    onSearchOpenChange(!searchOpen);
  }

  function toggleMethod(slug: string | undefined) {
    if (!slug) return;

    onUpdateFilters((current) => ({
      ...current,
      methodSlug: current.methodSlug === slug ? null : slug,
    }));
  }

  function clearAllFilters() {
    onSearchDraftChange("");
    onSearchOpenChange(false);
    onUpdateFilters(() => emptyFilters);
  }

  function openDrillDetail(drillId: string) {
    setSelectedDrillId(drillId);
    setDetailOpen(true);
  }

  function handleDetailOpenChange(open: boolean) {
    setDetailOpen(open);
  }

  function handleDetailAnimationEnd(open: boolean) {
    if (!open) {
      setSelectedDrillId(null);
      setDetailLoadState({ status: "idle" });
    }
  }

  const visibleDetailState =
    selectedDrillId && detailLoadState.status === "idle"
      ? ({ status: "loading", drillId: selectedDrillId } as const)
      : detailLoadState;

  return (
    <>
      <div className="network-map-scroll" aria-label="Scrollable Muay Thai drill network">
        <div className="network-map">
          <div className="network-grid" aria-hidden="true" />
          <div className="network-chip-row">
            {hasVisibleFilters ? (
              <>
                {selectedMethod && (
                  <button
                    type="button"
                    className="network-filter-chip"
                    onClick={() => onUpdateFilters((current) => ({ ...current, methodSlug: null }))}
                  >
                    Method: {selectedMethod.label}
                    {selectedMethodCount}
                    <span aria-hidden="true">x</span>
                  </button>
                )}
                {filters.keywords.map((keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    className="network-filter-chip"
                    onClick={() =>
                      onUpdateFilters((current) => ({
                        ...current,
                        keywords: current.keywords.filter((item) => item !== keyword),
                      }))
                    }
                  >
                    Search: {keyword}
                    <span aria-hidden="true">x</span>
                  </button>
                ))}
                {previewKeyword && !previewIsCommitted && (
                  <span className="network-preview-chip">
                    Preview: {previewKeyword}
                    {graphMatchesFilters ? ` (${activeDrillCount})` : ""}
                  </span>
                )}
                {refreshing && <span className="network-sync-chip">Updating</span>}
                {errorMessage && (
                  <button type="button" className="network-error-chip" onClick={onRetry}>
                    Retry filter
                  </button>
                )}
              </>
            ) : (
              <div className="network-status-chip">{drillCount} drills loaded</div>
            )}
          </div>

          <NetworkForceGraph
            graph={graph}
            badgeByIconKey={badgeByIconKey}
            focusedMethodSlug={filters.methodSlug}
            graphCanHighlight={graphCanHighlight}
            onMethodSelect={toggleMethod}
            onDrillSelect={openDrillDetail}
          />
        </div>
      </div>

      {searchOpen && (
        <form
          className="network-search-popover"
          onSubmit={(event) => {
            event.preventDefault();
            applySearchDraft();
          }}
        >
          <span className="search-mark" aria-hidden="true" />
          <input
            aria-label="Search keyword"
            autoFocus
            placeholder="Search for keyword"
            value={searchDraft}
            onChange={(event) => onSearchDraftChange(event.target.value)}
          />
        </form>
      )}

      {controlsOpen && (
        <div className="network-controls-panel" role="dialog" aria-label="Network controls">
          <header>
            <p className="eyebrow">Network Controls</p>
            <button type="button" onClick={() => setControlsOpen(false)}>
              Close
            </button>
          </header>
          <div className="network-control-row">
            <span>Training Method</span>
            <strong>{selectedMethod?.label ?? "None"}</strong>
          </div>
          <div className="network-method-filter-list" aria-label="Training Method filters">
            {methods.map((method) => (
              <button
                key={method.id}
                type="button"
                data-selected={method.slug === filters.methodSlug}
                onClick={() => toggleMethod(method.slug)}
              >
                {method.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="network-clear-focus"
            disabled={!hasVisibleFilters}
            onClick={clearAllFilters}
          >
            Clear filters
          </button>
          <div className="network-control-row">
            <span>Tags</span>
            <strong>Off</strong>
          </div>
          <div className="network-control-row">
            <span>Status</span>
            <strong>Off</strong>
          </div>
        </div>
      )}

      <div className="network-action-rail" aria-label="Network actions">
        <button
          type="button"
          aria-label="Network controls"
          aria-expanded={controlsOpen}
          data-active={controlsOpen}
          onClick={() => setControlsOpen((open) => !open)}
        >
          <span className="rail-icon rail-icon-filter" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Search network"
          aria-expanded={searchOpen}
          data-active={searchOpen}
          onClick={toggleSearch}
        >
          <span className="rail-icon rail-icon-search" aria-hidden="true" />
        </button>
        <button type="button" className="record-button" aria-label="Record drill" disabled>
          <span className="rail-icon rail-icon-record" aria-hidden="true" />
        </button>
      </div>

      {selectedDrillId && visibleDetailState.status !== "idle" && (
        <DrillDetailSheet
          state={visibleDetailState}
          badgeByIconKey={badgeByIconKey}
          open={detailOpen}
          onOpenChange={handleDetailOpenChange}
          onAnimationEnd={handleDetailAnimationEnd}
          onRetry={() => setDetailRetryNonce((current) => current + 1)}
        />
      )}
    </>
  );
}

function NetworkStatePanel({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="network-grid" aria-hidden="true" />
      <div className="network-state-panel">
        <p className="eyebrow">Network</p>
        <h1>{title}</h1>
        <p>{body}</p>
        {children}
      </div>
    </>
  );
}

function sortMethods(nodes: GraphNode[]): GraphNode[] {
  return [...nodes].sort((a, b) => getMethodRank(a.slug) - getMethodRank(b.slug));
}

function getMethodRank(slug: string | undefined): number {
  if (!slug) return Number.MAX_SAFE_INTEGER;
  const rank = methodOrder.indexOf(slug);
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}

function buildFilterKey(filters: NetworkFilters): string {
  return JSON.stringify(normalizeNetworkFilters(filters));
}

function normalizeNetworkFilters(filters: NetworkFilters): NetworkFilters {
  return {
    methodSlug: filters.methodSlug,
    keywords: [...new Set(filters.keywords.map(normalizeKeyword).filter(Boolean))],
  };
}

function addPreviewKeyword(filters: NetworkFilters, previewKeyword: string): NetworkFilters {
  if (!previewKeyword) {
    return normalizeNetworkFilters(filters);
  }

  return normalizeNetworkFilters({
    ...filters,
    keywords: [...filters.keywords, previewKeyword],
  });
}

function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function hasActiveFilters(filters: NetworkFilters): boolean {
  return Boolean(filters.methodSlug) || filters.keywords.length > 0;
}

function hasGraphFilters(graph: GraphResponse): boolean {
  const filters = graph.filters;

  return (
    filters.keywords.length > 0 ||
    filters.methodSlugs.length > 0 ||
    filters.tagSlugs.length > 0 ||
    filters.statusTagSlugs.length > 0
  );
}

function graphFiltersMatchNetworkFilters(graphFilters: GraphResponse["filters"], filters: NetworkFilters): boolean {
  const normalizedFilters = normalizeNetworkFilters(filters);
  const graphMethodSlug = graphFilters.methodSlugs.length === 1 ? graphFilters.methodSlugs[0] : null;

  return (
    graphMethodSlug === normalizedFilters.methodSlug &&
    listsMatch(graphFilters.keywords.map(normalizeKeyword), normalizedFilters.keywords)
  );
}

function listsMatch(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightValues = new Set(right);
  return left.every((value) => rightValues.has(value));
}

function isEmptyFilterSet(filters: NetworkFilters): boolean {
  return !hasActiveFilters(filters);
}

function toDrillFilters(filters: NetworkFilters): DrillFilterInput {
  return {
    keywords: filters.keywords,
    methodSlugs: filters.methodSlug ? [filters.methodSlug] : [],
  };
}

function getNetworkErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `The graph API returned ${error.status}.`;
  }

  if (error instanceof ApiResponseValidationError) {
    return "The graph API response no longer matches the frontend contract.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The graph could not be loaded.";
}

function getDrillDetailErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return "That drill could not be found.";
    }

    return `The drill API returned ${error.status}.`;
  }

  if (error instanceof ApiResponseValidationError) {
    return "The drill detail response no longer matches the frontend contract.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The drill could not be loaded.";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
