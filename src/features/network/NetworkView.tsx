"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  ApiClientOptions,
  DrillFilterInput,
  GraphOptionsInput,
  GraphResponse,
  TaxonomyResponse,
} from "@/data/types";
import { useDebouncedValue } from "@/features/shared/use-debounced-value";
import {
  addPreviewKeyword,
  getNetworkErrorMessage,
  isAbortError,
  isDefaultLayerSet,
  isEmptyFilterSet,
  normalizeKeyword,
  normalizeNetworkFilters,
  toDrillFilters,
} from "./network-helpers";
import { NetworkGraphPanel } from "./NetworkGraphPanel";
import { NetworkGraphLoading, NetworkStatePanel } from "./NetworkStates";
import {
  defaultNetworkLayerOptions,
  emptyNetworkFilters,
  type NetworkFilters,
  type NetworkLoadState,
} from "./types";
import styles from "./Network.module.css";

type NetworkViewProps = {
  active: boolean;
  initialGraph?: GraphResponse;
  initialTaxonomy?: TaxonomyResponse;
};

// Owns graph API loading. Graph-local interactions live in NetworkGraphPanel.
export function NetworkView({ active, initialGraph, initialTaxonomy }: NetworkViewProps) {
  const [filters, setFilters] = useState<NetworkFilters>(emptyNetworkFilters);
  const [layerOptions, setLayerOptions] = useState(defaultNetworkLayerOptions);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [loadState, setLoadState] = useState<NetworkLoadState>(() =>
    initialGraph ? { status: "loaded", graph: initialGraph, refreshing: false } : { status: "loading" },
  );
  const {
    debouncedValue: debouncedPreviewKeyword,
    deferValue: deferPreviewKeyword,
    setValueImmediately: setPreviewKeywordImmediately,
  } = useDebouncedValue("");
  const previewKeyword = searchOpen ? normalizeKeyword(searchDraft) : "";
  const requestPreviewKeyword = searchOpen && previewKeyword ? debouncedPreviewKeyword : "";
  const effectiveFilters = useMemo(
    () => addPreviewKeyword(filters, previewKeyword),
    [filters, previewKeyword],
  );
  const requestFilters = useMemo(
    () => addPreviewKeyword(filters, requestPreviewKeyword),
    [filters, requestPreviewKeyword],
  );
  const serializedRequestFilters = JSON.stringify(requestFilters);
  const stableRequestFilters = useMemo(
    // Submitting a settled preview moves the same keyword into committed filters.
    // Preserve the request object in that value-equivalent transition so it does
    // not abort and repeat an identical graph request.
    () => JSON.parse(serializedRequestFilters) as NetworkFilters,
    [serializedRequestFilters],
  );
  const taxonomyQuery = useQuery({
    queryKey: ["taxonomy"],
    queryFn: ({ signal }) => getTaxonomyOnDemand({ requestInit: { signal } }),
    initialData: initialTaxonomy,
    staleTime: 10 * 60 * 1000,
  });

  const retryGraph = useCallback(() => {
    setRetryNonce((current) => current + 1);
  }, []);

  const updateFilters = useCallback((updater: (current: NetworkFilters) => NetworkFilters) => {
    setFilters((current) => normalizeNetworkFilters(updater(current)));
  }, []);

  const updateSearchDraft = useCallback((value: string) => {
    setSearchDraft(value);
    const normalizedKeyword = normalizeKeyword(value);
    if (normalizedKeyword) {
      deferPreviewKeyword(normalizedKeyword);
    } else {
      setPreviewKeywordImmediately("");
    }
  }, [deferPreviewKeyword, setPreviewKeywordImmediately]);

  useEffect(() => {
    let cancelled = false;

    if (isEmptyFilterSet(stableRequestFilters) && isDefaultLayerSet(layerOptions) && initialGraph) {
      queueMicrotask(() => {
        if (!cancelled) {
          setLoadState({ status: "loaded", graph: initialGraph, refreshing: false });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();

    queueMicrotask(() => {
      if (cancelled) return;
      setLoadState((current) => {
        if (current.status === "loaded") {
          return { ...current, refreshing: true, errorMessage: undefined };
        }

        return { status: "loading" };
      });
    });

    getGraphOnDemand(
      toDrillFilters(stableRequestFilters),
      layerOptions,
      { requestInit: { signal: controller.signal } },
    )
      .then((graph) => {
        if (!cancelled && !controller.signal.aborted) {
          setLoadState({ status: "loaded", graph, refreshing: false });
        }
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted || isAbortError(error)) return;
        const message = getNetworkErrorMessage(error);
        setLoadState((current) => {
          if (current.status === "loaded") {
            return { ...current, refreshing: false, errorMessage: message };
          }

          return { status: "error", message };
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [initialGraph, layerOptions, retryNonce, stableRequestFilters]);

  return (
    <section className={styles.view} aria-label="Network view">
      {loadState.status === "loading" && <NetworkGraphLoading />}

      {loadState.status === "error" && (
        <NetworkStatePanel title="Network unavailable" body={loadState.message}>
          <button type="button" onClick={retryGraph}>
            Retry
          </button>
        </NetworkStatePanel>
      )}

      {loadState.status === "loaded" && (
        <NetworkGraphPanel
          active={active}
          graph={loadState.graph}
          filters={filters}
          effectiveFilters={effectiveFilters}
          layerOptions={layerOptions}
          taxonomy={taxonomyQuery.data}
          taxonomyLoading={taxonomyQuery.isLoading}
          taxonomyErrorMessage={taxonomyQuery.error ? getNetworkErrorMessage(taxonomyQuery.error) : undefined}
          previewKeyword={previewKeyword}
          searchOpen={searchOpen}
          searchDraft={searchDraft}
          refreshing={loadState.refreshing}
          errorMessage={loadState.errorMessage}
          onRetry={retryGraph}
          onSearchOpenChange={setSearchOpen}
          onSearchDraftChange={updateSearchDraft}
          onUpdateFilters={updateFilters}
          onLayerOptionsChange={setLayerOptions}
          onRetryTaxonomy={() => void taxonomyQuery.refetch()}
        />
      )}
    </section>
  );
}

async function getGraphOnDemand(
  filters: DrillFilterInput,
  graphOptions: GraphOptionsInput,
  options: ApiClientOptions,
): Promise<GraphResponse> {
  const { getGraph } = await import("@/data/graph");
  return getGraph(filters, graphOptions, options);
}

async function getTaxonomyOnDemand(options: ApiClientOptions): Promise<TaxonomyResponse> {
  const { getTaxonomy } = await import("@/data/taxonomy");
  return getTaxonomy(options);
}
