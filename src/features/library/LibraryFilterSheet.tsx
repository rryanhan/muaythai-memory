"use client";

import { Drawer } from "vaul";
import type { TagDto, TaxonomyResponse } from "@/data";
import { SavedListToken } from "@/features/shared/SavedListToken";
import {
  filterBuiltInStatuses,
  filterTagCategories,
  filterTags,
  formatDraftFilterCount,
  getPreviewMessage,
  normalizeKeyword,
} from "./library-helpers";
import type { BuiltInStatusFilter, FilterPreviewState, TaxonomyLoadState } from "./types";
import styles from "./Library.module.css";

type LibraryFilterSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taxonomyState: TaxonomyLoadState;
  tagCategories: TaxonomyResponse["tagCategories"];
  customTags: TagDto[];
  builtInStatuses: BuiltInStatusFilter[];
  activeTagSlugs: string[];
  activeStatusTagSlugs: string[];
  draftTagSlugs: string[];
  draftStatusTagSlugs: string[];
  tagSearch: string;
  previewState: FilterPreviewState;
  onTagSearchChange: (value: string) => void;
  onToggleTag: (tagSlug: string) => void;
  onToggleStatusTag: (statusSlug: string) => void;
  onApplyTags: () => void;
  onClearTags: () => void;
  onRetry: () => void;
  onRetryPreview: () => void;
};

export function LibraryFilterSheet({
  open,
  onOpenChange,
  taxonomyState,
  tagCategories,
  customTags,
  builtInStatuses,
  activeTagSlugs,
  activeStatusTagSlugs,
  draftTagSlugs,
  draftStatusTagSlugs,
  tagSearch,
  previewState,
  onTagSearchChange,
  onToggleTag,
  onToggleStatusTag,
  onApplyTags,
  onClearTags,
  onRetry,
  onRetryPreview,
}: LibraryFilterSheetProps) {
  const normalizedQuery = normalizeKeyword(tagSearch);
  const draftTagSet = new Set(draftTagSlugs);
  const draftStatusSet = new Set(draftStatusTagSlugs);
  const filteredTagCategories = filterTagCategories(tagCategories, normalizedQuery, draftTagSet);
  const filteredCustomTags = filterTags(customTags, normalizedQuery, draftTagSet);
  const filteredBuiltInStatuses = filterBuiltInStatuses(builtInStatuses, normalizedQuery, draftStatusSet);
  const hasVisibleTags =
    filteredBuiltInStatuses.length > 0 ||
    filteredTagCategories.some((category) => category.tags.length > 0) ||
    filteredCustomTags.length > 0;
  const hasTagFilters =
    activeTagSlugs.length > 0 ||
    draftTagSlugs.length > 0 ||
    activeStatusTagSlugs.length > 0 ||
    draftStatusTagSlugs.length > 0;
  const hasSheetState = hasTagFilters || Boolean(tagSearch.trim());
  const draftFilterCount = draftTagSlugs.length + draftStatusTagSlugs.length;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom" modal dismissible autoFocus={false}>
      <Drawer.Portal>
        <Drawer.Overlay className={styles.filterBackdrop} />
        <Drawer.Content className={styles.filterSheet} aria-label="Library filters">
          <Drawer.Handle className="sheet-handle" />
          <header className="library-filter-sheet-header">
            <div>
              <Drawer.Title asChild>
                <h2>Filter Drills</h2>
              </Drawer.Title>
              <Drawer.Description asChild>
                <p>{formatDraftFilterCount(draftFilterCount)}</p>
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
                    {filteredBuiltInStatuses.length > 0 && (
                      <section className="library-tag-category">
                        <h3>Saved Lists</h3>
                        <div>
                          {filteredBuiltInStatuses.map((status) => (
                            <SavedListToken
                              key={status.id}
                              option={status}
                              selected={draftStatusSet.has(status.slug)}
                              onToggle={onToggleStatusTag}
                            />
                          ))}
                        </div>
                      </section>
                    )}
                    {filteredTagCategories.map((category) => (
                      <section key={category.id} className="library-tag-category">
                        <h3>{category.name}</h3>
                        <div>
                          {category.tags.map((tag) => (
                            <FilterTokenButton
                              key={tag.id}
                              label={tag.name}
                              selected={draftTagSet.has(tag.slug)}
                              slug={tag.slug}
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
                            <FilterTokenButton
                              key={tag.id}
                              label={tag.name}
                              selected={draftTagSet.has(tag.slug)}
                              slug={tag.slug}
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

function FilterTokenButton({
  label,
  selected,
  slug,
  onToggle,
}: {
  label: string;
  selected: boolean;
  slug: string;
  onToggle: (slug: string) => void;
}) {
  return (
    <button type="button" data-selected={selected} onClick={() => onToggle(slug)}>
      {label}
    </button>
  );
}
