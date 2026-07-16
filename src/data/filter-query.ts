import type { DrillFilterInput } from "./types";

export function buildDrillSearchParams(filters: DrillFilterInput = {}): URLSearchParams {
  const searchParams = new URLSearchParams();
  const tagSlugs = [
    ...(filters.tagSlugs ?? []),
    ...(filters.standardTagSlugs ?? []),
    ...(filters.customTagSlugs ?? []),
  ];

  appendStringList(searchParams, "keyword", filters.keywords);
  appendStringList(searchParams, "method", filters.methodSlugs);
  appendStringList(searchParams, "tag", tagSlugs);
  appendStringList(searchParams, "status", filters.statusTagSlugs);

  if (filters.tagMode) searchParams.set("tagMode", filters.tagMode);
  if (filters.statusMode) searchParams.set("statusMode", filters.statusMode);

  return searchParams;
}

export function appendQueryString(path: string, searchParams: URLSearchParams): string {
  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export function appendBoolean(searchParams: URLSearchParams, key: string, value: boolean | undefined) {
  if (value === true) searchParams.set(key, "true");
}

function appendStringList(searchParams: URLSearchParams, key: string, values: string[] | undefined) {
  for (const value of normalizeStringList(values ?? [])) {
    searchParams.append(key, value);
  }
}

function normalizeStringList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
