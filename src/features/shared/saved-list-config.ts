import type { SavedListSlug } from "@/data/types";

export type SavedListDefinition = {
  slug: SavedListSlug;
  label: string;
  icon: "star" | "target";
  sortOrder: number;
};

// Product-facing Saved Lists stay centralized so forms, filters, and quick
// actions cannot drift in naming or order.
export const savedListDefinitions: readonly SavedListDefinition[] = [
  { slug: "starred", label: "Favourite", icon: "star", sortOrder: 10 },
  { slug: "drill-back-in", label: "Drill Back In", icon: "target", sortOrder: 20 },
];

export function getSavedListDefinition(slug: string): SavedListDefinition | undefined {
  return savedListDefinitions.find((definition) => definition.slug === slug);
}
