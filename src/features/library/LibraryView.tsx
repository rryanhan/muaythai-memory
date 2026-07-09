"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDrills, getTaxonomy, type TagDto } from "@/data";
import { badgeByIconKey } from "@/components/shared/context-badges";
import { LibraryDrillRow, LibraryLoadingList, LibraryStatePanel } from "./LibraryDrillList";
import { LibraryFilterSheet } from "./LibraryFilterSheet";
import { LibraryIndexPanel } from "./LibraryIndexPanel";
import {
  formatDrillCount,
  getBuiltInStatusFilters,
  hasActiveFilters,
  normalizeKeyword,
  toDrillFilters,
  toDrillListState,
  toPreviewState,
  toTaxonomyState,
} from "./library-helpers";
import { emptyLibraryFilters, type BuiltInStatusFilter, type LibraryFilters } from "./types";

// Owns Training Log query/filter state. Child components own index, sheet, and row presentation.
export function LibraryView() {
  const [filters, setFilters] = useState<LibraryFilters>(emptyLibraryFilters);
  const [indexOpen, setIndexOpen] = useState(false);
  const [tagPanelOpen, setTagPanelOpen] = useState(false);
  const [draftTagSlugs, setDraftTagSlugs] = useState<string[]>([]);
  const [draftStatusTagSlugs, setDraftStatusTagSlugs] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const drillFilters = useMemo(() => toDrillFilters(filters), [filters]);
  const previewFilters = useMemo(
    () => toDrillFilters({ ...filters, tagSlugs: draftTagSlugs, statusTagSlugs: draftStatusTagSlugs }),
    [draftStatusTagSlugs, draftTagSlugs, filters],
  );

  const taxonomyQuery = useQuery({
    queryKey: ["taxonomy"],
    queryFn: ({ signal }) => getTaxonomy({ requestInit: { signal } }),
    staleTime: 10 * 60 * 1000,
  });
  const drillListQuery = useQuery({
    queryKey: ["drills", drillFilters],
    queryFn: ({ signal }) => getDrills(drillFilters, { requestInit: { signal } }),
    placeholderData: (previousData) => previousData,
    staleTime: 60 * 1000,
  });
  const previewQuery = useQuery({
    queryKey: ["drills", "preview", previewFilters],
    queryFn: ({ signal }) => getDrills(previewFilters, { requestInit: { signal } }),
    enabled: tagPanelOpen,
    staleTime: 60 * 1000,
  });
  const taxonomyState = toTaxonomyState(taxonomyQuery);
  const drillListState = toDrillListState(drillListQuery);
  const previewState = toPreviewState(previewQuery, tagPanelOpen);

  const taxonomy = taxonomyState.status === "loaded" ? taxonomyState.taxonomy : undefined;
  const methods = taxonomy?.trainingMethods ?? [];
  const standardTagCategories = taxonomy?.tagCategories ?? [];
  const customTags = taxonomy?.customTags ?? [];
  const builtInStatuses = useMemo(() => getBuiltInStatusFilters(taxonomy?.statusTags ?? []), [taxonomy?.statusTags]);
  const selectedMethod = filters.methodSlug
    ? methods.find((method) => method.slug === filters.methodSlug)
    : undefined;
  const selectedTags = useMemo(() => {
    const allTags = [...(taxonomy?.standardTags ?? []), ...(taxonomy?.customTags ?? [])];
    return filters.tagSlugs
      .map((slug) => allTags.find((tag) => tag.slug === slug))
      .filter((tag): tag is TagDto => Boolean(tag));
  }, [filters.tagSlugs, taxonomy]);
  const selectedStatuses = useMemo(() => {
    return filters.statusTagSlugs
      .map((slug) => builtInStatuses.find((status) => status.slug === slug))
      .filter((status): status is BuiltInStatusFilter => Boolean(status));
  }, [builtInStatuses, filters.statusTagSlugs]);
  const drills = drillListState.status === "loaded" ? drillListState.response.drills : [];
  const total = drillListState.status === "loaded" ? drillListState.response.total : 0;
  const hasFilters = hasActiveFilters(filters);
  const pageTitle = selectedMethod?.name ?? "All Drills";
  const pageSubtitle = drillListState.status === "loading" ? "Loading drills" : formatDrillCount(total);
  const pageBadge = selectedMethod?.iconKey ? badgeByIconKey[selectedMethod.iconKey] : undefined;

  function setKeyword(keyword: string) {
    setFilters((current) => ({ ...current, keyword }));
  }

  function setMethod(methodSlug: string | null) {
    setFilters((current) => ({ ...current, methodSlug }));
    setIndexOpen(false);
  }

  function toggleDraftTag(tagSlug: string) {
    setDraftTagSlugs((current) =>
      current.includes(tagSlug) ? current.filter((slug) => slug !== tagSlug) : [...current, tagSlug],
    );
  }

  function toggleDraftStatusTag(statusSlug: string) {
    setDraftStatusTagSlugs((current) =>
      current.includes(statusSlug) ? current.filter((slug) => slug !== statusSlug) : [...current, statusSlug],
    );
  }

  function clearTag(tagSlug: string) {
    setFilters((current) => ({
      ...current,
      tagSlugs: current.tagSlugs.filter((slug) => slug !== tagSlug),
    }));
  }

  function clearStatusTag(statusSlug: string) {
    setFilters((current) => ({
      ...current,
      statusTagSlugs: current.statusTagSlugs.filter((slug) => slug !== statusSlug),
    }));
  }

  function clearTagFilters() {
    setDraftTagSlugs([]);
    setDraftStatusTagSlugs([]);
    setFilters((current) => ({ ...current, tagSlugs: [], statusTagSlugs: [] }));
    setTagSearch("");
  }

  function clearAllFilters() {
    setFilters(emptyLibraryFilters);
    setTagSearch("");
    setTagPanelOpen(false);
  }

  function handleTagPanelOpenChange(open: boolean) {
    if (open) {
      setDraftTagSlugs(filters.tagSlugs);
      setDraftStatusTagSlugs(filters.statusTagSlugs);
    } else {
      setTagSearch("");
    }

    setTagPanelOpen(open);
  }

  function applyTagFilters() {
    setFilters((current) => ({ ...current, tagSlugs: draftTagSlugs, statusTagSlugs: draftStatusTagSlugs }));
    setTagSearch("");
    setTagPanelOpen(false);
  }

  return (
    <section className="library-view" aria-label="Training Log">
      <button
        type="button"
        className="index-spine"
        aria-label="Open Training Method index"
        aria-expanded={indexOpen}
        onClick={() => setIndexOpen((open) => !open)}
      >
        <span aria-hidden="true" />
      </button>

      {indexOpen && (
        <LibraryIndexPanel
          methods={methods}
          selectedMethodSlug={filters.methodSlug}
          taxonomyState={taxonomyState}
          onSelectMethod={setMethod}
          onClose={() => setIndexOpen(false)}
          onRetry={() => void taxonomyQuery.refetch()}
        />
      )}

      <header className="library-header">
        <p className="eyebrow">Training Log</p>
        <div className="library-title-row">
          {pageBadge && <img src={pageBadge} alt="" aria-hidden="true" />}
          <div>
            <h1>{pageTitle}</h1>
            <p>{pageSubtitle}</p>
          </div>
        </div>
        <div className="library-search-row">
          <label className="library-search">
            <span className="search-mark" aria-hidden="true" />
            <input
              aria-label="Search drills by keyword"
              placeholder="Search for keyword"
              value={filters.keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>
          <button
            type="button"
            aria-label="Filter by tags"
            data-active={tagPanelOpen || filters.tagSlugs.length > 0 || filters.statusTagSlugs.length > 0}
            onClick={() => handleTagPanelOpenChange(!tagPanelOpen)}
          >
            <span className="rail-icon rail-icon-filter" aria-hidden="true" />
          </button>
        </div>
        {hasFilters && (
          <div className="library-active-filters" aria-label="Active library filters">
            {filters.keyword.trim() && (
              <button type="button" onClick={() => setKeyword("")}>
                Search: {normalizeKeyword(filters.keyword)}
                <span aria-hidden="true">x</span>
              </button>
            )}
            {selectedMethod && (
              <button type="button" onClick={() => setMethod(null)}>
                Method: {selectedMethod.name}
                <span aria-hidden="true">x</span>
              </button>
            )}
            {selectedTags.map((tag) => (
              <button key={tag.id} type="button" onClick={() => clearTag(tag.slug)}>
                Tag: {tag.name}
                <span aria-hidden="true">x</span>
              </button>
            ))}
            {selectedStatuses.map((status) => (
              <button key={status.slug} type="button" onClick={() => clearStatusTag(status.slug)}>
                Saved: {status.label}
                <span aria-hidden="true">x</span>
              </button>
            ))}
            <button type="button" className="library-clear-filters" onClick={clearAllFilters}>
              Clear
            </button>
          </div>
        )}
      </header>

      <LibraryFilterSheet
        open={tagPanelOpen}
        onOpenChange={handleTagPanelOpenChange}
        taxonomyState={taxonomyState}
        tagCategories={standardTagCategories}
        customTags={customTags}
        builtInStatuses={builtInStatuses}
        activeTagSlugs={filters.tagSlugs}
        activeStatusTagSlugs={filters.statusTagSlugs}
        draftTagSlugs={draftTagSlugs}
        draftStatusTagSlugs={draftStatusTagSlugs}
        tagSearch={tagSearch}
        previewState={previewState}
        onTagSearchChange={setTagSearch}
        onToggleTag={toggleDraftTag}
        onToggleStatusTag={toggleDraftStatusTag}
        onApplyTags={applyTagFilters}
        onClearTags={clearTagFilters}
        onRetry={() => void taxonomyQuery.refetch()}
        onRetryPreview={() => void previewQuery.refetch()}
      />

      {drillListState.status === "loading" && <LibraryLoadingList />}

      {drillListState.status === "error" && (
        <LibraryStatePanel title="Couldn’t load drills" body={drillListState.message}>
          <button type="button" onClick={() => void drillListQuery.refetch()}>
            Retry
          </button>
        </LibraryStatePanel>
      )}

      {drillListState.status === "loaded" && (
        <>
          {drillListState.errorMessage && (
            <button
              type="button"
              className="library-inline-error"
              onClick={() => void drillListQuery.refetch()}
            >
              Retry latest filter
            </button>
          )}
          {drills.length > 0 ? (
            <div className="library-list" aria-label="Drill entries" data-refreshing={drillListState.refreshing}>
              {drills.map((drill) => (
                <LibraryDrillRow key={drill.id} drill={drill} />
              ))}
            </div>
          ) : (
            <LibraryStatePanel title="No drills found" body="Try clearing one filter or using a broader keyword.">
              {hasFilters && (
                <button type="button" onClick={clearAllFilters}>
                  Clear filters
                </button>
              )}
            </LibraryStatePanel>
          )}
        </>
      )}
    </section>
  );
}
