import { taxonomyResponseSchema } from "@/modules/taxonomy/contracts";
import type { ApiClientOptions, TaxonomyResponse } from "./types";
import { fetchJson } from "./api-core";

// Taxonomy is app-wide reference data shared by Capture, Network, and Library.
export async function getTaxonomy(options: ApiClientOptions = {}): Promise<TaxonomyResponse> {
  return fetchJson("/api/taxonomy", taxonomyResponseSchema, options);
}
