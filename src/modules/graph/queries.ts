import { getTaxonomy } from "@/modules/taxonomy/queries";
import { drillMatchesFilters, listDrills, normalizeDrillFilters } from "@/modules/drills/queries";
import type { DrillFilters } from "@/modules/drills/contracts";
import type { DrillSummary } from "@/modules/drills/contracts";
import type { GraphEdge, GraphNode, GraphOptions, GraphResponse } from "./contracts";

// Builds the current Muay Thai network read model. Training Method -> Drill is
// always present; tag/status layers are optional so the graph does not start
// as a dense hairball.
export async function getMuayThaiGraph(
  filters: Partial<DrillFilters> = {},
  options: Partial<GraphOptions> = {},
): Promise<GraphResponse> {
  const normalizedFilters = normalizeDrillFilters(filters);
  const normalizedOptions: GraphOptions = {
    showTags: options.showTags ?? false,
    showCustomTags: options.showCustomTags ?? false,
    showStatusTags: options.showStatusTags ?? false,
  };

  const [taxonomy, drillList] = await Promise.all([getTaxonomy(), listDrills()]);
  const allDrills = drillList.drills;
  const matchedDrills = allDrills.filter((drill) => drillMatchesFilters(drill, normalizedFilters));
  const hasActiveFilters = hasFilters(normalizedFilters);
  const matchedDrillIds = new Set(matchedDrills.map((drill) => drill.id));
  const activeMethodSlugs = collectMethodSlugs(matchedDrills, normalizedFilters.methodSlugs);
  const activeTagSlugs = collectTagSlugs(matchedDrills, normalizedFilters.tagSlugs);
  const activeStatusSlugs = collectStatusSlugs(matchedDrills, normalizedFilters.statusTagSlugs);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // "active" is a rendering hint for dimming unrelated graph context. We still
  // return inactive nodes so the frontend can preserve spatial orientation.
  for (const method of taxonomy.trainingMethods) {
    const selected = normalizedFilters.methodSlugs.includes(method.slug);
    nodes.push({
      id: methodNodeId(method.slug),
      entityId: method.id,
      type: "trainingMethod",
      label: method.name,
      slug: method.slug,
      iconKey: method.iconKey,
      active: !hasActiveFilters || activeMethodSlugs.has(method.slug) || selected,
      matched: selected,
      selected,
    });
  }

  // Drill nodes always exist in the graph payload. Filters affect active/matched
  // state, not whether the client can keep the network stable.
  for (const drill of allDrills) {
    const active = !hasActiveFilters || matchedDrillIds.has(drill.id);
    nodes.push({
      id: drillNodeId(drill.id),
      entityId: drill.id,
      type: "drill",
      label: drill.title,
      active,
      matched: matchedDrillIds.has(drill.id),
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
      const selected = normalizedFilters.tagSlugs.includes(tag.slug);
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

    addTagEdges(edges, allDrills, "tag", hasActiveFilters, matchedDrillIds, activeTagSlugs);
  }

  if (normalizedOptions.showCustomTags) {
    const customTagsBySlug = new Map(allDrills.flatMap((drill) => drill.customTags).map((tag) => [tag.slug, tag]));

    for (const tag of customTagsBySlug.values()) {
      const selected = normalizedFilters.tagSlugs.includes(tag.slug);
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

    addTagEdges(edges, allDrills, "customTag", hasActiveFilters, matchedDrillIds, activeTagSlugs);
  }

  if (normalizedOptions.showStatusTags) {
    for (const status of taxonomy.statusTags) {
      const selected = normalizedFilters.statusTagSlugs.includes(status.slug);
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

    for (const drill of allDrills) {
      const drillActive = !hasActiveFilters || matchedDrillIds.has(drill.id);

      for (const status of drill.statusTags) {
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
  matchedDrillIds: Set<string>,
  activeTagSlugs: Set<string>,
) {
  for (const drill of drills) {
    const drillActive = !hasActiveFilters || matchedDrillIds.has(drill.id);
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

function hasFilters(filters: DrillFilters): boolean {
  return (
    filters.keywords.length > 0 ||
    filters.methodSlugs.length > 0 ||
    filters.tagSlugs.length > 0 ||
    filters.statusTagSlugs.length > 0
  );
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
