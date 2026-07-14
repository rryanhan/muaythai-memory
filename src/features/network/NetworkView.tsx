"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGraph, getTaxonomy, type GraphResponse } from "@/data";
import {
  addPreviewKeyword,
  buildGraphRequestKey,
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
  initialGraph?: GraphResponse;
};

// Owns graph API loading. Graph-local interactions live in NetworkGraphPanel.
export function NetworkView({ initialGraph }: NetworkViewProps) {
  const [filters, setFilters] = useState<NetworkFilters>(emptyNetworkFilters);
  const [layerOptions, setLayerOptions] = useState(defaultNetworkLayerOptions);
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
  const graphRequestKey = useMemo(
    () => buildGraphRequestKey(effectiveFilters, layerOptions),
    [effectiveFilters, layerOptions],
  );
  const taxonomyQuery = useQuery({
    queryKey: ["taxonomy"],
    queryFn: ({ signal }) => getTaxonomy({ requestInit: { signal } }),
    staleTime: 10 * 60 * 1000,
  });

  const retryGraph = useCallback(() => {
    setRetryNonce((current) => current + 1);
  }, []);

  const updateFilters = useCallback((updater: (current: NetworkFilters) => NetworkFilters) => {
    setFilters((current) => normalizeNetworkFilters(updater(current)));
  }, []);

  useEffect(() => {
    if (isEmptyFilterSet(effectiveFilters) && isDefaultLayerSet(layerOptions) && initialGraph) {
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

    getGraph(toDrillFilters(effectiveFilters), layerOptions, { requestInit: { signal: controller.signal } })
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
  }, [graphRequestKey, initialGraph, layerOptions, retryNonce]);

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
          onSearchDraftChange={setSearchDraft}
          onUpdateFilters={updateFilters}
          onLayerOptionsChange={setLayerOptions}
          onRetryTaxonomy={() => void taxonomyQuery.refetch()}
        />
      )}
    </section>
  );
}
