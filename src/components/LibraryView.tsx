"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Drawer } from "vaul";
import {
  ApiError,
  ApiResponseValidationError,
  getDrills,
  getTaxonomy,
  type DrillFilterInput,
  type DrillListResponse,
  type DrillSummary,
  type TagDto,
  type TaxonomyResponse,
  type TrainingMethodDto,
} from "@/data";
import { badgeByIconKey } from "@/components/context-badges";

type LibraryFilters = {
  keyword: string;
  methodSlug: string | null;
  tagSlugs: string[];
};

type TaxonomyLoadState =
  | { status: "loading" }
  | { status: "loaded"; taxonomy: TaxonomyResponse }
  | { status: "error"; message: string };

type DrillListLoadState =
  | { status: "loading" }
  | { status: "loaded"; response: DrillListResponse; refreshing: boolean; errorMessage?: string }
  | { status: "error"; message: string };

type FilterPreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; total: number }
  | { status: "error"; message: string };

const emptyFilters: LibraryFilters = {
  keyword: "",
  methodSlug: null,
  tagSlugs: [],
};

export function LibraryView() {
  const [filters, setFilters] = useState<LibraryFilters>(emptyFilters);
  const [indexOpen, setIndexOpen] = useState(false);
  const [tagPanelOpen, setTagPanelOpen] = useState(false);
  const [draftTagSlugs, setDraftTagSlugs] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const drillFilters = useMemo(() => toDrillFilters(filters), [filters]);
  const previewFilters = useMemo(
    () => toDrillFilters({ ...filters, tagSlugs: draftTagSlugs }),
    [draftTagSlugs, filters],
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
  const selectedMethod = filters.methodSlug
    ? methods.find((method) => method.slug === filters.methodSlug)
    : undefined;
  const selectedTags = useMemo(() => {
    const allTags = [...(taxonomy?.standardTags ?? []), ...(taxonomy?.customTags ?? [])];
    return filters.tagSlugs
      .map((slug) => allTags.find((tag) => tag.slug === slug))
      .filter((tag): tag is TagDto => Boolean(tag));
  }, [filters.tagSlugs, taxonomy]);
  const drills = drillListState.status === "loaded" ? drillListState.response.drills : [];
  const total = drillListState.status === "loaded" ? drillListState.response.total : 0;
  const hasFilters = hasActiveFilters(filters);
  const pageTitle = selectedMethod?.name ?? "All Drills";
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

  function clearTag(tagSlug: string) {
    setFilters((current) => ({
      ...current,
      tagSlugs: current.tagSlugs.filter((slug) => slug !== tagSlug),
    }));
  }

  function clearTagFilters() {
    setDraftTagSlugs([]);
    setFilters((current) => ({ ...current, tagSlugs: [] }));
    setTagSearch("");
  }

  function clearAllFilters() {
    setFilters(emptyFilters);
    setTagSearch("");
    setTagPanelOpen(false);
  }

  function handleTagPanelOpenChange(open: boolean) {
    if (open) {
      setDraftTagSlugs(filters.tagSlugs);
    } else {
      setTagSearch("");
    }

    setTagPanelOpen(open);
  }

  function applyTagFilters() {
    setFilters((current) => ({ ...current, tagSlugs: draftTagSlugs }));
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
            <p>{formatDrillCount(total)}</p>
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
            data-active={tagPanelOpen || filters.tagSlugs.length > 0}
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
        activeTagSlugs={filters.tagSlugs}
        draftTagSlugs={draftTagSlugs}
        tagSearch={tagSearch}
        previewState={previewState}
        onTagSearchChange={setTagSearch}
        onToggleTag={toggleDraftTag}
        onApplyTags={applyTagFilters}
        onClearTags={clearTagFilters}
        onRetry={() => void taxonomyQuery.refetch()}
        onRetryPreview={() => void previewQuery.refetch()}
      />

      {drillListState.status === "loading" && (
        <LibraryStatePanel title="Loading drills" body="Pulling your Training Log." />
      )}

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

function LibraryIndexPanel({
  methods,
  selectedMethodSlug,
  taxonomyState,
  onSelectMethod,
  onClose,
  onRetry,
}: {
  methods: TrainingMethodDto[];
  selectedMethodSlug: string | null;
  taxonomyState: TaxonomyLoadState;
  onSelectMethod: (methodSlug: string | null) => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <aside className="library-index-panel" aria-label="Training Method index">
      <header>
        <p className="eyebrow">Index</p>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>

      {taxonomyState.status === "loading" && <p className="library-muted">Loading methods</p>}
      {taxonomyState.status === "error" && (
        <div className="library-filter-state">
          <p>{taxonomyState.message}</p>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
      {taxonomyState.status === "loaded" && (
        <div className="library-method-list">
          <button type="button" data-selected={!selectedMethodSlug} onClick={() => onSelectMethod(null)}>
            <span className="library-method-all-mark" aria-hidden="true" />
            <span>All Drills</span>
          </button>
          {methods.map((method) => (
            <button
              key={method.id}
              type="button"
              data-selected={selectedMethodSlug === method.slug}
              onClick={() => onSelectMethod(method.slug)}
            >
              <img src={badgeByIconKey[method.iconKey]} alt="" aria-hidden="true" />
              <span>{method.name}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

function LibraryFilterSheet({
  open,
  onOpenChange,
  taxonomyState,
  tagCategories,
  customTags,
  activeTagSlugs,
  draftTagSlugs,
  tagSearch,
  previewState,
  onTagSearchChange,
  onToggleTag,
  onApplyTags,
  onClearTags,
  onRetry,
  onRetryPreview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taxonomyState: TaxonomyLoadState;
  tagCategories: TaxonomyResponse["tagCategories"];
  customTags: TagDto[];
  activeTagSlugs: string[];
  draftTagSlugs: string[];
  tagSearch: string;
  previewState: FilterPreviewState;
  onTagSearchChange: (value: string) => void;
  onToggleTag: (tagSlug: string) => void;
  onApplyTags: () => void;
  onClearTags: () => void;
  onRetry: () => void;
  onRetryPreview: () => void;
}) {
  const normalizedQuery = normalizeKeyword(tagSearch);
  const draftTagSet = new Set(draftTagSlugs);
  const filteredTagCategories = filterTagCategories(tagCategories, normalizedQuery, draftTagSet);
  const filteredCustomTags = filterTags(customTags, normalizedQuery, draftTagSet);
  const hasVisibleTags =
    filteredTagCategories.some((category) => category.tags.length > 0) || filteredCustomTags.length > 0;
  const hasTagFilters = activeTagSlugs.length > 0 || draftTagSlugs.length > 0;
  const hasSheetState = hasTagFilters || Boolean(tagSearch.trim());

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom" modal dismissible autoFocus={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="library-filter-backdrop" />
        <Drawer.Content className="library-filter-sheet" aria-label="Library filters">
          <Drawer.Handle className="sheet-handle" />
          <header className="library-filter-sheet-header">
            <div>
              <Drawer.Title asChild>
                <h2>Filter Drills</h2>
              </Drawer.Title>
              <Drawer.Description asChild>
                <p>{formatDraftTagCount(draftTagSlugs.length)}</p>
              </Drawer.Description>
            </div>
            <Drawer.Close asChild>
              <button type="button">Close</button>
            </Drawer.Close>
          </header>

          <section className="library-filter-sheet-section" aria-label="Tags">
            <p className="eyebrow">Tags</p>
            <label className="library-filter-search">
              <span className="search-mark" aria-hidden="true" />
              <input
                type="search"
                aria-label="Search tags"
                placeholder="Search tags"
                autoComplete="off"
                value={tagSearch}
                onChange={(event) => onTagSearchChange(event.target.value)}
              />
            </label>

            {taxonomyState.status === "loading" && <p className="library-muted">Loading tags</p>}
            {taxonomyState.status === "error" && (
              <div className="library-filter-state">
                <p>{taxonomyState.message}</p>
                <button type="button" onClick={onRetry}>
                  Retry
                </button>
              </div>
            )}
            {taxonomyState.status === "loaded" && (
              <>
                {hasVisibleTags ? (
                  <div className="library-tag-category-grid">
                    {filteredTagCategories.map((category) => (
                      <section key={category.id} className="library-tag-category">
                        <h3>{category.name}</h3>
                        <div>
                          {category.tags.map((tag) => (
                            <TagFilterButton
                              key={tag.id}
                              tag={tag}
                              selected={draftTagSet.has(tag.slug)}
                              onToggle={onToggleTag}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                    {filteredCustomTags.length > 0 && (
                      <section className="library-tag-category library-custom-tag-category">
                        <h3>Custom Tags</h3>
                        <div>
                          {filteredCustomTags.map((tag) => (
                            <TagFilterButton
                              key={tag.id}
                              tag={tag}
                              selected={draftTagSet.has(tag.slug)}
                              onToggle={onToggleTag}
                            />
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                ) : (
                  <p className="library-tag-empty">No matching tags</p>
                )}
              </>
            )}
          </section>

          <footer className="library-filter-actions">
            <p>{getPreviewMessage(previewState)}</p>
            {previewState.status === "error" && (
              <button type="button" className="library-filter-preview-retry" onClick={onRetryPreview}>
                Retry
              </button>
            )}
            <div>
              <button
                type="button"
                className="library-filter-clear-button"
                disabled={!hasSheetState}
                onClick={onClearTags}
              >
                Clear filters
              </button>
              <button type="button" className="library-filter-apply-button" onClick={onApplyTags}>
                Apply filters
              </button>
            </div>
          </footer>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function TagFilterButton({
  tag,
  selected,
  onToggle,
}: {
  tag: TagDto;
  selected: boolean;
  onToggle: (tagSlug: string) => void;
}) {
  return (
    <button type="button" data-selected={selected} onClick={() => onToggle(tag.slug)}>
      {tag.name}
    </button>
  );
}

function filterTagCategories(
  tagCategories: TaxonomyResponse["tagCategories"],
  query: string,
  selectedTagSet: Set<string>,
): TaxonomyResponse["tagCategories"] {
  return tagCategories
    .map((category) => {
      const categoryMatches = query.length > 0 && category.name.toLowerCase().includes(query);
      const tags = category.tags.filter((tag) => tagMatchesQuery(tag, query, categoryMatches, selectedTagSet));

      return { ...category, tags };
    })
    .filter((category) => category.tags.length > 0);
}

function filterTags(tags: TagDto[], query: string, selectedTagSet: Set<string>): TagDto[] {
  return tags.filter((tag) => tagMatchesQuery(tag, query, false, selectedTagSet));
}

function tagMatchesQuery(tag: TagDto, query: string, categoryMatches: boolean, selectedTagSet: Set<string>): boolean {
  if (selectedTagSet.has(tag.slug)) return true;
  if (!query) return true;
  return categoryMatches || tag.name.toLowerCase().includes(query) || tag.slug.includes(query);
}

function LibraryDrillRow({ drill }: { drill: DrillSummary }) {
  const router = useRouter();
  const leadingMethod = drill.trainingMethods[0]?.name ?? "Drill";
  const visibleTags = [...drill.tags, ...drill.customTags].slice(0, 4);
  const href = `/drills/${drill.id}`;

  function prefetchDetail() {
    router.prefetch(href);
  }

  return (
    <article className="library-row">
      <Link href={href} prefetch onFocus={prefetchDetail} onPointerEnter={prefetchDetail} onTouchStart={prefetchDetail}>
        <p>{leadingMethod}</p>
        <h2>{drill.title}</h2>
        <span>{visibleTags.length > 0 ? visibleTags.map((tag) => tag.name).join(" · ") : "No tags"}</span>
      </Link>
    </article>
  );
}

function LibraryStatePanel({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <section className="library-state-panel">
      <p className="eyebrow">Training Log</p>
      <h2>{title}</h2>
      <p>{body}</p>
      {children}
    </section>
  );
}

function toDrillFilters(filters: LibraryFilters): DrillFilterInput {
  const keyword = normalizeKeyword(filters.keyword);

  return {
    keywords: keyword ? [keyword] : [],
    methodSlugs: filters.methodSlug ? [filters.methodSlug] : [],
    tagSlugs: filters.tagSlugs,
    tagMode: "all",
  };
}

function toTaxonomyState(query: UseQueryResult<TaxonomyResponse, Error>): TaxonomyLoadState {
  if (query.data) {
    return { status: "loaded", taxonomy: query.data };
  }

  if (query.isError) {
    return { status: "error", message: getLibraryErrorMessage(query.error, "taxonomy") };
  }

  return { status: "loading" };
}

function toDrillListState(query: UseQueryResult<DrillListResponse, Error>): DrillListLoadState {
  if (query.data) {
    return {
      status: "loaded",
      response: query.data,
      refreshing: query.isFetching && !query.isLoading,
      errorMessage: query.isError ? getLibraryErrorMessage(query.error, "drills") : undefined,
    };
  }

  if (query.isError) {
    return { status: "error", message: getLibraryErrorMessage(query.error, "drills") };
  }

  return { status: "loading" };
}

function toPreviewState(query: UseQueryResult<DrillListResponse, Error>, enabled: boolean): FilterPreviewState {
  if (!enabled) {
    return { status: "idle" };
  }

  if (query.data) {
    return { status: "loaded", total: query.data.total };
  }

  if (query.isError) {
    return { status: "error", message: getLibraryErrorMessage(query.error, "drills") };
  }

  return { status: "loading" };
}

function hasActiveFilters(filters: LibraryFilters): boolean {
  return Boolean(normalizeKeyword(filters.keyword)) || Boolean(filters.methodSlug) || filters.tagSlugs.length > 0;
}

function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatDrillCount(total: number): string {
  return `${total} captured ${total === 1 ? "drill" : "drills"}`;
}

function formatDraftTagCount(total: number): string {
  return `${total} ${total === 1 ? "tag" : "tags"} selected`;
}

function getPreviewMessage(previewState: FilterPreviewState): string {
  if (previewState.status === "loading") return "Checking matching drills";
  if (previewState.status === "loaded") {
    return `${previewState.total} matching ${previewState.total === 1 ? "drill" : "drills"}`;
  }
  if (previewState.status === "error") return previewState.message;
  return "Select tags, then apply";
}

function getLibraryErrorMessage(error: unknown, resource: "taxonomy" | "drills"): string {
  if (error instanceof ApiError) {
    return `The ${resource} API returned ${error.status}.`;
  }

  if (error instanceof ApiResponseValidationError) {
    return `The ${resource} response no longer matches the frontend contract.`;
  }

  return `The ${resource} could not be loaded.`;
}
