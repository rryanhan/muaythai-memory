import type { StatusTagDto, TagDto, TaxonomyResponse } from "@/data";
import { savedListDefinitions } from "./saved-list-config";

export type BuiltInStatusFilter = {
  id: string;
  icon: "star" | "target";
  label: string;
  slug: string;
  sortOrder: number;
};

export type BuiltInStatusSource = Pick<StatusTagDto, "id" | "name" | "slug" | "sortOrder">;

// Shared tag/status filtering for Library and Network picker surfaces.
export function filterTagCategories(
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

export function filterTags(tags: TagDto[], query: string, selectedTagSet: Set<string>): TagDto[] {
  return tags.filter((tag) => tagMatchesQuery(tag, query, false, selectedTagSet));
}

export function filterBuiltInStatuses(
  statuses: BuiltInStatusFilter[],
  query: string,
  selectedStatusSet: Set<string>,
): BuiltInStatusFilter[] {
  return statuses.filter((status) => {
    if (selectedStatusSet.has(status.slug)) return true;
    if (!query) return true;

    return status.label.toLowerCase().includes(query) || status.slug.includes(query);
  });
}

export function getBuiltInStatusFilters(statusTags: StatusTagDto[]): BuiltInStatusFilter[] {
  return savedListDefinitions
    .map((definition): BuiltInStatusFilter | null => {
      const status = statusTags.find((candidate) => candidate.slug === definition.slug);
      return status ? { ...definition, id: status.id, sortOrder: status.sortOrder } : null;
    })
    .filter((status): status is BuiltInStatusFilter => status !== null)
    .sort((first, second) => first.sortOrder - second.sortOrder);
}

function tagMatchesQuery(tag: TagDto, query: string, categoryMatches: boolean, selectedTagSet: Set<string>): boolean {
  if (selectedTagSet.has(tag.slug)) return true;
  if (!query) return true;
  return categoryMatches || tag.name.toLowerCase().includes(query) || tag.slug.includes(query);
}
