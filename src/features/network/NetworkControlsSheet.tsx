"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { Drawer } from "vaul";
import type { GraphOptions, TagDto, TaxonomyResponse } from "@/data";
import { SavedListToken } from "@/features/shared/SavedListToken";
import {
  filterBuiltInStatuses,
  filterTagCategories,
  filterTags,
  getBuiltInStatusFilters,
} from "@/features/shared/tag-filter-helpers";
import { normalizeKeyword } from "./network-helpers";
import { defaultNetworkLayerOptions, emptyNetworkFilters, type NetworkFilters } from "./types";
import styles from "./Network.module.css";

type NetworkControlsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: NetworkFilters;
  layerOptions: GraphOptions;
  taxonomy?: TaxonomyResponse;
  taxonomyLoading: boolean;
  taxonomyErrorMessage?: string;
  tagSearch: string;
  tagSelectOpen: boolean;
  onTagSearchChange: (value: string) => void;
  onTagSelectOpenChange: (open: boolean) => void;
  onUpdateFilters: (updater: (current: NetworkFilters) => NetworkFilters) => void;
  onLayerOptionsChange: Dispatch<SetStateAction<GraphOptions>>;
  onRetryTaxonomy: () => void;
};

export function NetworkControlsSheet({
  open,
  onOpenChange,
  filters,
  layerOptions,
  taxonomy,
  taxonomyLoading,
  taxonomyErrorMessage,
  tagSearch,
  tagSelectOpen,
  onTagSearchChange,
  onTagSelectOpenChange,
  onUpdateFilters,
  onLayerOptionsChange,
  onRetryTaxonomy,
}: NetworkControlsSheetProps) {
  const normalizedQuery = normalizeKeyword(tagSearch);
  const selectedTagSet = new Set(filters.tagSlugs);
  const selectedStatusSet = new Set(filters.statusTagSlugs);
  const tagCategories = taxonomy?.tagCategories ?? [];
  const customTags = taxonomy?.customTags ?? [];
  const builtInStatuses = getBuiltInStatusFilters(taxonomy?.statusTags ?? []);
  const filteredTagCategories = filterTagCategories(tagCategories, normalizedQuery, selectedTagSet);
  const filteredCustomTags = filterTags(customTags, normalizedQuery, selectedTagSet);
  const filteredBuiltInStatuses = filterBuiltInStatuses(builtInStatuses, normalizedQuery, selectedStatusSet);
  const selectedCount = filters.tagSlugs.length + filters.statusTagSlugs.length;
  const hasVisibleTags =
    filteredBuiltInStatuses.length > 0 ||
    filteredTagCategories.some((category) => category.tags.length > 0) ||
    filteredCustomTags.length > 0;
  const hasViewState =
    filters.methodSlugs.length !== emptyNetworkFilters.methodSlugs.length ||
    filters.keywords.length > 0 ||
    filters.tagSlugs.length > 0 ||
    filters.statusTagSlugs.length > 0 ||
    layerOptions.showTags !== defaultNetworkLayerOptions.showTags ||
    layerOptions.showCustomTags !== defaultNetworkLayerOptions.showCustomTags ||
    layerOptions.showStatusTags !== defaultNetworkLayerOptions.showStatusTags ||
    Boolean(tagSearch.trim());

  function toggleTag(tagSlug: string) {
    onUpdateFilters((current) => ({
      ...current,
      tagSlugs: current.tagSlugs.includes(tagSlug)
        ? current.tagSlugs.filter((slug) => slug !== tagSlug)
        : [...current.tagSlugs, tagSlug],
    }));
  }

  function toggleStatus(statusSlug: string) {
    onUpdateFilters((current) => ({
      ...current,
      statusTagSlugs: current.statusTagSlugs.includes(statusSlug)
        ? current.statusTagSlugs.filter((slug) => slug !== statusSlug)
        : [...current.statusTagSlugs, statusSlug],
    }));
  }

  function resetView() {
    onTagSearchChange("");
    onTagSelectOpenChange(false);
    onUpdateFilters(() => emptyNetworkFilters);
    onLayerOptionsChange(defaultNetworkLayerOptions);
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom" modal dismissible autoFocus={false}>
      <Drawer.Portal>
        <Drawer.Overlay className={styles.controlsBackdrop} />
        <Drawer.Content className={styles.controlsSheet} aria-label="Network controls">
          <Drawer.Handle className="sheet-handle" />
          <header className="network-controls-sheet-header">
            <Drawer.Title asChild>
              <h2>Network Controls</h2>
            </Drawer.Title>
            <Drawer.Close asChild>
              <button type="button">Close</button>
            </Drawer.Close>
          </header>

          <section className="network-controls-section" aria-label="Graph layers">
            <p className="section-label">Layers</p>
            <LayerToggle
              checked={layerOptions.showTags}
              label="Show tag nodes"
              onChange={(checked) => onLayerOptionsChange((current) => ({ ...current, showTags: checked }))}
            />
            <LayerToggle
              checked={layerOptions.showCustomTags}
              label="Show custom tag nodes"
              onChange={(checked) => onLayerOptionsChange((current) => ({ ...current, showCustomTags: checked }))}
            />
            <LayerToggle
              checked={layerOptions.showStatusTags}
              label="Show saved list nodes"
              onChange={(checked) => onLayerOptionsChange((current) => ({ ...current, showStatusTags: checked }))}
            />
          </section>

          <section className="network-controls-section network-controls-tag-section" aria-label="Tag filter">
            <p className="section-label">Tag Filter</p>
            <div className="network-tag-filter">
              <label className="network-filter-search">
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
              <button
                type="button"
                className="network-select-box-trigger"
                data-active={selectedCount > 0 || tagSelectOpen}
                aria-expanded={tagSelectOpen}
                onClick={() => onTagSelectOpenChange(!tagSelectOpen)}
              >
                <span>{selectedCount ? `${selectedCount} selected` : "Select tags"}</span>
                <CaretDown aria-hidden="true" size={18} weight="bold" />
              </button>

              {tagSelectOpen && (
                <div className="network-tag-select" aria-label="Selectable graph tags">
                  {taxonomyLoading && <p className="network-tag-empty">Loading tags</p>}
                  {taxonomyErrorMessage && (
                    <div className="network-filter-state">
                      <p>{taxonomyErrorMessage}</p>
                      <button type="button" onClick={onRetryTaxonomy}>
                        Retry
                      </button>
                    </div>
                  )}
                  {taxonomy && hasVisibleTags && (
                    <>
                      {filteredBuiltInStatuses.length > 0 && (
                        <TagGroup title="Saved Lists">
                          {filteredBuiltInStatuses.map((status) => (
                            <SavedListToken
                              key={status.id}
                              option={status}
                              selected={selectedStatusSet.has(status.slug)}
                              onToggle={toggleStatus}
                            />
                          ))}
                        </TagGroup>
                      )}
                      {filteredTagCategories.map((category) => (
                        <TagGroup key={category.id} title={category.name}>
                          {category.tags.map((tag) => (
                            <TagTokenButton
                              key={tag.id}
                              label={tag.name}
                              selected={selectedTagSet.has(tag.slug)}
                              slug={tag.slug}
                              onToggle={toggleTag}
                            />
                          ))}
                        </TagGroup>
                      ))}
                      {filteredCustomTags.length > 0 && (
                        <TagGroup title="Custom Tags">
                          {filteredCustomTags.map((tag) => (
                            <TagTokenButton
                              key={tag.id}
                              label={tag.name}
                              selected={selectedTagSet.has(tag.slug)}
                              slug={tag.slug}
                              onToggle={toggleTag}
                            />
                          ))}
                        </TagGroup>
                      )}
                    </>
                  )}
                  {taxonomy && !hasVisibleTags && <p className="network-tag-empty">No matching tags</p>}
                </div>
              )}
            </div>
          </section>

          <button type="button" className="network-controls-reset" disabled={!hasViewState} onClick={resetView}>
            Reset view
          </button>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function LayerToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="network-layer-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function TagGroup({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="network-tag-group">
      <h3>{title}</h3>
      <div>{children}</div>
    </section>
  );
}

function TagTokenButton({
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
