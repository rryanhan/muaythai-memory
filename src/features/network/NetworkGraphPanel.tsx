"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Microphone } from "@phosphor-icons/react/Microphone";
import { SlidersHorizontal } from "@phosphor-icons/react/SlidersHorizontal";
import {
  getDrill,
  type GraphOptions,
  type GraphResponse,
  type TagDto,
  type TaxonomyResponse,
  type UpdateSavedListResponse,
} from "@/data";
import { badgeByIconKey } from "@/components/shared/context-badges";
import { DrillDetailSheet } from "@/features/drills/DrillDetailSheet";
import { getBuiltInStatusFilters, type BuiltInStatusFilter } from "@/features/shared/tag-filter-helpers";
import { updateStatusTags } from "@/features/shared/saved-list-state";
import { NetworkControlsSheet } from "./NetworkControlsSheet";
import { NetworkForceGraph } from "./NetworkForceGraph";
import {
  buildNetworkGraphVisualState,
  getDrillDetailErrorMessage,
  graphFiltersMatchNetworkFilters,
  hasActiveFilters,
  isAbortError,
  normalizeKeyword,
  sortMethods,
} from "./network-helpers";
import { type DrillDetailLoadState, type NetworkFilters } from "./types";
import { NetworkStatePanel } from "./NetworkStates";

type NetworkGraphPanelProps = {
  graph: GraphResponse;
  filters: NetworkFilters;
  effectiveFilters: NetworkFilters;
  layerOptions: GraphOptions;
  taxonomy?: TaxonomyResponse;
  taxonomyLoading: boolean;
  taxonomyErrorMessage?: string;
  previewKeyword: string;
  searchOpen: boolean;
  searchDraft: string;
  refreshing: boolean;
  errorMessage?: string;
  onRetry: () => void;
  onSearchOpenChange: (open: boolean) => void;
  onSearchDraftChange: (value: string) => void;
  onUpdateFilters: (updater: (current: NetworkFilters) => NetworkFilters) => void;
  onLayerOptionsChange: Dispatch<SetStateAction<GraphOptions>>;
  onRetryTaxonomy: () => void;
};

// Owns graph-local UI state that should not reset the outer graph fetch loop.
export function NetworkGraphPanel({
  graph,
  filters,
  effectiveFilters,
  layerOptions,
  taxonomy,
  taxonomyLoading,
  taxonomyErrorMessage,
  previewKeyword,
  searchOpen,
  searchDraft,
  refreshing,
  errorMessage,
  onRetry,
  onSearchOpenChange,
  onSearchDraftChange,
  onUpdateFilters,
  onLayerOptionsChange,
  onRetryTaxonomy,
}: NetworkGraphPanelProps) {
  const [controlsOpen, setControlsOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [tagSelectOpen, setTagSelectOpen] = useState(false);
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
  const graphMatchesFilters = graphFiltersMatchNetworkFilters(graph.filters, effectiveFilters);
  const graphVisualState = useMemo(
    () => buildNetworkGraphVisualState(graph, effectiveFilters),
    [effectiveFilters, graph],
  );
  const selectedMethods = filters.methodSlugs
    .map((slug) => methods.find((method) => method.slug === slug))
    .filter((method): method is (typeof methods)[number] => Boolean(method));
  const selectedTags = useMemo(() => {
    const allTags = [...(taxonomy?.standardTags ?? []), ...(taxonomy?.customTags ?? [])];
    return filters.tagSlugs
      .map((slug) => allTags.find((tag) => tag.slug === slug) ?? toFallbackTag(slug))
      .filter((tag): tag is TagDto => Boolean(tag));
  }, [filters.tagSlugs, taxonomy]);
  const builtInStatuses = useMemo(() => getBuiltInStatusFilters(taxonomy?.statusTags ?? []), [taxonomy]);
  const selectedStatuses = useMemo(() => {
    return filters.statusTagSlugs
      .map((slug) => builtInStatuses.find((status) => status.slug === slug) ?? toFallbackStatus(slug))
      .filter((status): status is BuiltInStatusFilter => Boolean(status));
  }, [builtInStatuses, filters.statusTagSlugs]);

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
      methodSlugs: current.methodSlugs.includes(slug)
        ? current.methodSlugs.filter((methodSlug) => methodSlug !== slug)
        : [...current.methodSlugs, slug],
    }));
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

  function handleDetailSavedListChange(result: UpdateSavedListResponse) {
    setDetailLoadState((current) => {
      if (current.status !== "loaded" || current.drill.id !== result.drillId) return current;

      return {
        status: "loaded",
        drill: {
          ...current.drill,
          statusTags: updateStatusTags(current.drill.statusTags, result.status, result.selected),
        },
      };
    });

    // Saved List state only changes visible graph data when its node layer or
    // a Saved List filter is active.
    if (layerOptions.showStatusTags || filters.statusTagSlugs.length > 0) onRetry();
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
                {selectedMethods.map((method) => (
                  <button
                    key={method.slug}
                    type="button"
                    className="network-filter-chip"
                    onClick={() =>
                      onUpdateFilters((current) => ({
                        ...current,
                        methodSlugs: current.methodSlugs.filter((slug) => slug !== method.slug),
                      }))
                    }
                  >
                    Method: {method.label}
                    <span aria-hidden="true">x</span>
                  </button>
                ))}
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
                {selectedTags.map((tag) => (
                  <button
                    key={tag.slug}
                    type="button"
                    className="network-filter-chip"
                    onClick={() =>
                      onUpdateFilters((current) => ({
                        ...current,
                        tagSlugs: current.tagSlugs.filter((slug) => slug !== tag.slug),
                      }))
                    }
                  >
                    Tag: {tag.name}
                    <span aria-hidden="true">x</span>
                  </button>
                ))}
                {selectedStatuses.map((status) => (
                  <button
                    key={status.slug}
                    type="button"
                    className="network-filter-chip"
                    onClick={() =>
                      onUpdateFilters((current) => ({
                        ...current,
                        statusTagSlugs: current.statusTagSlugs.filter((slug) => slug !== status.slug),
                      }))
                    }
                  >
                    Saved: {status.label}
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
            focusedMethodSlugs={filters.methodSlugs}
            visualState={graphVisualState}
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
          <MagnifyingGlass size={24} weight="regular" aria-hidden="true" />
          <input
            ref={searchInputRef}
            aria-label="Search keyword"
            placeholder="Search for keyword"
            value={searchDraft}
            onChange={(event) => onSearchDraftChange(event.target.value)}
          />
        </form>
      )}

      <NetworkControlsSheet
        open={controlsOpen}
        onOpenChange={(open) => {
          setControlsOpen(open);
          if (!open) {
            setTagSearch("");
            setTagSelectOpen(false);
          }
        }}
        filters={filters}
        layerOptions={layerOptions}
        taxonomy={taxonomy}
        taxonomyLoading={taxonomyLoading}
        taxonomyErrorMessage={taxonomyErrorMessage}
        tagSearch={tagSearch}
        tagSelectOpen={tagSelectOpen}
        onTagSearchChange={setTagSearch}
        onTagSelectOpenChange={setTagSelectOpen}
        onUpdateFilters={onUpdateFilters}
        onLayerOptionsChange={onLayerOptionsChange}
        onRetryTaxonomy={onRetryTaxonomy}
      />

      <div className="network-action-rail" aria-label="Network actions">
        <button
          type="button"
          aria-label="Network controls"
          aria-expanded={controlsOpen}
          data-active={controlsOpen}
          onClick={() => setControlsOpen((open) => !open)}
        >
          <SlidersHorizontal size={25} weight="regular" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Search network"
          aria-expanded={searchOpen}
          data-active={searchOpen}
          onClick={toggleSearch}
        >
          <MagnifyingGlass size={26} weight="regular" aria-hidden="true" />
        </button>
        <Link
          className="record-button"
          href="/capture/new?mode=voice&from=network"
          aria-label="Capture drill"
          prefetch
        >
          <Microphone size={27} weight="regular" aria-hidden="true" />
        </Link>
      </div>

      {selectedDrillId && visibleDetailState.status !== "idle" && (
        <DrillDetailSheet
          state={visibleDetailState}
          badgeByIconKey={badgeByIconKey}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          onAnimationEnd={handleDetailAnimationEnd}
          onRetry={() => setDetailRetryNonce((current) => current + 1)}
          onSavedListChange={handleDetailSavedListChange}
        />
      )}
    </>
  );
}

function toFallbackTag(slug: string): TagDto {
  return {
    id: slug,
    name: slug
      .split("-")
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" "),
    slug,
    kind: "standard",
    sortOrder: 0,
    category: null,
  };
}

function toFallbackStatus(slug: string): BuiltInStatusFilter {
  return {
    id: slug,
    icon: slug === "drill-back-in" ? "target" : "star",
    label: slug === "drill-back-in" ? "Drill Back In" : "Favourite",
    slug,
    sortOrder: 0,
  };
}
