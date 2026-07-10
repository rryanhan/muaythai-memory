"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getDrill, type GraphResponse } from "@/data";
import { badgeByIconKey } from "@/components/shared/context-badges";
import { DrillDetailSheet } from "@/features/drills/DrillDetailSheet";
import { NetworkForceGraph } from "./NetworkForceGraph";
import {
  getDrillDetailErrorMessage,
  graphFiltersMatchNetworkFilters,
  hasActiveFilters,
  hasGraphFilters,
  isAbortError,
  normalizeKeyword,
  sortMethods,
} from "./network-helpers";
import { emptyNetworkFilters, type DrillDetailLoadState, type NetworkFilters } from "./types";
import { NetworkStatePanel } from "./NetworkStates";

type NetworkGraphPanelProps = {
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
};

// Owns graph-local UI state that should not reset the outer graph fetch loop.
export function NetworkGraphPanel({
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
}: NetworkGraphPanelProps) {
  const [controlsOpen, setControlsOpen] = useState(false);
  const [selectedDrillId, setSelectedDrillId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRetryNonce, setDetailRetryNonce] = useState(0);
  const [detailLoadState, setDetailLoadState] = useState<DrillDetailLoadState>({ status: "idle" });
  const [keyboardInset, setKeyboardInset] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const methods = useMemo(() => sortMethods(graph.nodes.filter((node) => node.type === "trainingMethod")), [graph]);
  const drills = useMemo(() => graph.nodes.filter((node) => node.type === "drill"), [graph]);
  const drillCount = drills.length;
  const activeDrillCount = drills.filter((node) => node.active).length;
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

  useEffect(() => {
    if (!searchOpen) return;

    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) {
      setKeyboardInset(0);
      return;
    }

    const viewport = window.visualViewport;

    function updateKeyboardInset() {
      if (!viewport) {
        setKeyboardInset(0);
        return;
      }

      const nextInset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      setKeyboardInset(nextInset);
    }

    updateKeyboardInset();

    if (!viewport) return;

    viewport.addEventListener("resize", updateKeyboardInset);
    viewport.addEventListener("scroll", updateKeyboardInset);

    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset);
      viewport.removeEventListener("scroll", updateKeyboardInset);
    };
  }, [searchOpen]);

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
    onUpdateFilters(() => emptyNetworkFilters);
  }

  function openDrillDetail(drillId: string) {
    setSelectedDrillId(drillId);
    setDetailOpen(true);
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
  const searchPopoverStyle = {
    "--network-keyboard-inset": `${keyboardInset}px`,
  } as CSSProperties;

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
          style={searchPopoverStyle}
          onSubmit={(event) => {
            event.preventDefault();
            applySearchDraft();
          }}
        >
          <span className="search-mark" aria-hidden="true" />
          <input
            ref={searchInputRef}
            aria-label="Search keyword"
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
          onOpenChange={setDetailOpen}
          onAnimationEnd={handleDetailAnimationEnd}
          onRetry={() => setDetailRetryNonce((current) => current + 1)}
        />
      )}
    </>
  );
}
