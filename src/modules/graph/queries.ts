import { getTaxonomy } from "@/modules/taxonomy/queries";
import {
  drillMatchesFilters,
  hasActiveDrillFilters,
  listDrills,
  normalizeDrillFilters,
} from "@/modules/drills/queries";
import type { DrillFilters, DrillListResponse, DrillSummary } from "@/modules/drills/contracts";
import type { TaxonomyResponse } from "@/modules/taxonomy/contracts";
import type { GraphEdge, GraphNode, GraphOptions, GraphResponse } from "./contracts";

// Builds the current Muay Thai network read model. Training Method -> Drill is
// always present; tag/status layers are optional so the graph does not start
// as a dense hairball.
export async function getMuayThaiGraph(
  userId: string,
  filters: Partial<DrillFilters> = {},
  options: Partial<GraphOptions> = {},
): Promise<GraphResponse> {
  const normalizedFilters = normalizeDrillFilters(filters);
  const normalizedOptions: GraphOptions = {
    showTags: options.showTags ?? false,
    showCustomTags: options.showCustomTags ?? false,
    showStatusTags: options.showStatusTags ?? false,
  };
  const keywordSearchNeedsAllLabels = normalizedFilters.keywords.length > 0;

  const [taxonomy, drillList] = await Promise.all([
    getTaxonomy(userId, {
      includeTagCategories: false,
      includeStandardTags: normalizedOptions.showTags,
      includeCustomTags: normalizedOptions.showCustomTags,
      includeStatusTags: normalizedOptions.showStatusTags,
    }),
    // Keep the full drill population so filtering only changes visual state;
    // selectively hydrate the relations needed to evaluate the requested filter.
    listDrills(userId, {}, {
      includeTags:
        normalizedOptions.showTags ||
        normalizedOptions.showCustomTags ||
        keywordSearchNeedsAllLabels ||
        normalizedFilters.tagSlugs.length > 0,
      includeStatusTags:
        normalizedOptions.showStatusTags ||
        keywordSearchNeedsAllLabels ||
        normalizedFilters.statusTagSlugs.length > 0,
    }),
  ]);

  return buildMuayThaiGraph(taxonomy, drillList, normalizedFilters, normalizedOptions);
}

export async function getInitialNetworkData(
  userId: string,
): Promise<{ graph: GraphResponse }> {
  // Reuse the default graph plan so the initial page reads only Training
  // Methods and drill-method relations. The complete controls taxonomy should
  // not cross the server/client boundary until requested.
  return { graph: await getMuayThaiGraph(userId) };
}

function buildMuayThaiGraph(
  taxonomy: TaxonomyResponse,
  drillList: DrillListResponse,
  normalizedFilters: DrillFilters,
  normalizedOptions: GraphOptions,
): GraphResponse {
  const allDrills = drillList.drills;
  const hasActiveFilters = hasActiveDrillFilters(normalizedFilters);
  const matchedDrills = hasActiveFilters
    ? allDrills.filter((drill) => drillMatchesFilters(drill, normalizedFilters))
    : allDrills;
  const hasMethodFilters = normalizedFilters.methodSlugs.length > 0;
  const matchedDrillIds = hasActiveFilters
    ? new Set(matchedDrills.map((drill) => drill.id))
    : undefined;
  const layerDrills = hasActiveFilters ? matchedDrills : allDrills;
  const selectedMethodSlugs = new Set(normalizedFilters.methodSlugs);
  const selectedTagSlugs = new Set(normalizedFilters.tagSlugs);
  const selectedStatusSlugs = new Set(normalizedFilters.statusTagSlugs);
  const activeMethodSlugs = hasMethodFilters
    ? selectedMethodSlugs
    : hasActiveFilters
      ? collectMethodSlugs(matchedDrills, [])
      : new Set<string>();
  const visibleTagSlugs = normalizedOptions.showTags
    ? collectTagSlugs(layerDrills, normalizedFilters.tagSlugs)
    : new Set<string>();
  const visibleStatusSlugs = normalizedOptions.showStatusTags
    ? collectStatusSlugs(layerDrills, normalizedFilters.statusTagSlugs)
    : new Set<string>();
  const activeTagSlugs = hasActiveFilters && (normalizedOptions.showTags || normalizedOptions.showCustomTags)
    ? collectTagSlugs(matchedDrills, normalizedFilters.tagSlugs)
    : new Set<string>();
  const activeStatusSlugs = hasActiveFilters && normalizedOptions.showStatusTags
    ? collectStatusSlugs(matchedDrills, normalizedFilters.statusTagSlugs)
    : new Set<string>();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // "active" is a rendering hint for dimming unrelated graph context. We still
  // return inactive nodes so the frontend can preserve spatial orientation.
  for (const method of taxonomy.trainingMethods) {
    const selected = selectedMethodSlugs.has(method.slug);
    nodes.push({
      id: methodNodeId(method.slug),
      entityId: method.id,
      type: "trainingMethod",
      label: method.name,
      slug: method.slug,
      iconKey: method.iconKey,
      active: hasMethodFilters ? selected : !hasActiveFilters || activeMethodSlugs.has(method.slug),
      matched: selected,
      selected,
    });
  }

  // Drill nodes always exist in the graph payload. Filters affect active/matched
  // state, not whether the client can keep the network stable.
  for (const drill of allDrills) {
    const active = matchedDrillIds?.has(drill.id) ?? true;
    nodes.push({
      id: drillNodeId(drill.id),
      entityId: drill.id,
      type: "drill",
      label: drill.title,
      active,
      matched: active,
      selected: false,
    });

    for (const method of drill.trainingMethods) {
      edges.push({
        id: edgeId(methodNodeId(method.slug), drillNodeId(drill.id), "method"),
        from: methodNodeId(method.slug),
        to: drillNodeId(drill.id),
        type: "method",
        active: active && (!hasActiveFilters || activeMethodSlugs.has(method.slug)),
      });
    }
  }

  if (normalizedOptions.showTags) {
    for (const tag of taxonomy.standardTags) {
      const selected = selectedTagSlugs.has(tag.slug);
      if (!visibleTagSlugs.has(tag.slug) && !selected) continue;

      nodes.push({
        id: tagNodeId(tag.slug),
        entityId: tag.id,
        type: "tag",
        label: tag.name,
        slug: tag.slug,
        active: !hasActiveFilters || activeTagSlugs.has(tag.slug) || selected,
        matched: selected,
        selected,
      });
    }

    addTagEdges(edges, layerDrills, "tag", hasActiveFilters, matchedDrillIds, activeTagSlugs);
  }

  if (normalizedOptions.showCustomTags) {
    const customTagsBySlug = new Map(layerDrills.flatMap((drill) => drill.customTags).map((tag) => [tag.slug, tag]));

    for (const tag of taxonomy.customTags) {
      if (selectedTagSlugs.has(tag.slug)) {
        customTagsBySlug.set(tag.slug, tag);
      }
    }

    for (const tag of customTagsBySlug.values()) {
      const selected = selectedTagSlugs.has(tag.slug);
      nodes.push({
        id: customTagNodeId(tag.slug),
        entityId: tag.id,
        type: "customTag",
        label: tag.name,
        slug: tag.slug,
        active: !hasActiveFilters || activeTagSlugs.has(tag.slug) || selected,
        matched: selected,
        selected,
      });
    }

    addTagEdges(edges, layerDrills, "customTag", hasActiveFilters, matchedDrillIds, activeTagSlugs);
  }

  if (normalizedOptions.showStatusTags) {
    for (const status of taxonomy.statusTags) {
      const selected = selectedStatusSlugs.has(status.slug);
      if (!visibleStatusSlugs.has(status.slug) && !selected) continue;

      nodes.push({
        id: statusNodeId(status.slug),
        entityId: status.id,
        type: "statusTag",
        label: status.name,
        slug: status.slug,
        active: !hasActiveFilters || activeStatusSlugs.has(status.slug) || selected,
        matched: selected,
        selected,
      });
    }

    for (const drill of layerDrills) {
      const drillActive = matchedDrillIds?.has(drill.id) ?? true;

      for (const status of drill.statusTags) {
        if (!visibleStatusSlugs.has(status.slug) && !selectedStatusSlugs.has(status.slug)) continue;

        edges.push({
          id: edgeId(statusNodeId(status.slug), drillNodeId(drill.id), "statusTag"),
          from: statusNodeId(status.slug),
          to: drillNodeId(drill.id),
          type: "statusTag",
          active: drillActive && (!hasActiveFilters || activeStatusSlugs.has(status.slug)),
        });
      }
    }
  }

  return {
    nodes,
    edges,
    filters: normalizedFilters,
    options: normalizedOptions,
  };
}

// Tag edges share the same activation rules for standard and custom tags, but
// use different node prefixes so their graph identities never collide.
function addTagEdges(
  edges: GraphEdge[],
  drills: DrillSummary[],
  tagType: "tag" | "customTag",
  hasActiveFilters: boolean,
  matchedDrillIds: Set<string> | undefined,
  activeTagSlugs: Set<string>,
) {
  for (const drill of drills) {
    const drillActive = matchedDrillIds?.has(drill.id) ?? true;
    const drillTags = tagType === "tag" ? drill.tags : drill.customTags;

    for (const tag of drillTags) {
      const from = tagType === "tag" ? tagNodeId(tag.slug) : customTagNodeId(tag.slug);
      edges.push({
        id: edgeId(from, drillNodeId(drill.id), tagType),
        from,
        to: drillNodeId(drill.id),
        type: tagType,
        active: drillActive && (!hasActiveFilters || activeTagSlugs.has(tag.slug)),
      });
    }
  }
}

function collectMethodSlugs(drills: DrillSummary[], selectedSlugs: string[]): Set<string> {
  return new Set([...selectedSlugs, ...drills.flatMap((drill) => drill.trainingMethods.map((method) => method.slug))]);
}

function collectTagSlugs(drills: DrillSummary[], selectedSlugs: string[]): Set<string> {
  return new Set([
    ...selectedSlugs,
    ...drills.flatMap((drill) => [...drill.tags, ...drill.customTags].map((tag) => tag.slug)),
  ]);
}

function collectStatusSlugs(drills: DrillSummary[], selectedSlugs: string[]): Set<string> {
  return new Set([...selectedSlugs, ...drills.flatMap((drill) => drill.statusTags.map((status) => status.slug))]);
}

function methodNodeId(slug: string): string {
  return `method:${slug}`;
}

function drillNodeId(id: string): string {
  return `drill:${id}`;
}

function tagNodeId(slug: string): string {
  return `tag:${slug}`;
}

function customTagNodeId(slug: string): string {
  return `custom-tag:${slug}`;
}

function statusNodeId(slug: string): string {
  return `status:${slug}`;
}

function edgeId(from: string, to: string, type: GraphEdge["type"]): string {
  return `${type}:${from}->${to}`;
}
