import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  drillStatusTags,
  drillSteps,
  drillTags,
  drillTrainingMethods,
  drills,
  statusTags,
  tagCategories,
  tags,
  trainingMethods,
} from "@/db/schema";
import type { StatusTagDto, TagDto, TrainingMethodDto } from "@/modules/taxonomy/contracts";
import type { DrillDetail, DrillFilters, DrillListResponse, DrillSummary, FilterMode } from "./contracts";

type DrillBaseRow = typeof drills.$inferSelect;

type DrillStepDto = DrillDetail["steps"][number];

// Returns list-ready drill summaries. Full steps are intentionally left out so
// library/profile/network screens can load quickly on mobile.
export async function listDrills(userId: string, filters: Partial<DrillFilters> = {}): Promise<DrillListResponse> {
  const normalizedFilters = normalizeDrillFilters(filters);
  const allDrills = await loadDrillSummaries(userId);
  const filteredDrills = allDrills.filter((drill) => drillMatchesFilters(drill, normalizedFilters));

  return {
    drills: filteredDrills,
    total: filteredDrills.length,
    filters: normalizedFilters,
  };
}

// Detail loading is separate from list loading because graph nodes should open
// the full drill only after the user taps one.
export async function getDrillById(userId: string, id: string): Promise<DrillDetail | null> {
  const [drillRow] = await db
    .select()
    .from(drills)
    .where(and(eq(drills.id, id), eq(drills.userId, userId)))
    .limit(1);

  if (!drillRow) return null;

  const [trainingMethodRows, tagRows, statusRows, stepRows] = await Promise.all([
    loadTrainingMethodsForDrill(id),
    loadTagsForDrill(userId, id),
    loadStatusTagsForDrill(id),
    loadStepsForDrill(id),
  ]);

  return {
    id: drillRow.id,
    title: drillRow.title,
    summary: drillRow.summary,
    notes: drillRow.notes,
    trainingMethods: trainingMethodRows,
    tags: tagRows.filter((tag) => tag.kind === "standard"),
    customTags: tagRows.filter((tag) => tag.kind === "custom"),
    statusTags: statusRows,
    createdAt: drillRow.createdAt,
    updatedAt: drillRow.updatedAt,
    steps: stepRows,
  };
}

export async function getFirstDrillDetail(
  userId: string,
  filters: Partial<DrillFilters> = {},
): Promise<DrillDetail | null> {
  const drillList = await listDrills(userId, filters);
  const firstDrill = drillList.drills[0];
  if (!firstDrill) return null;
  return getDrillById(userId, firstDrill.id);
}

export function normalizeDrillFilters(filters: Partial<DrillFilters> = {}): DrillFilters {
  return {
    keywords: normalizeStringList(filters.keywords ?? []),
    methodSlugs: normalizeSlugList(filters.methodSlugs ?? []),
    tagSlugs: normalizeSlugList(filters.tagSlugs ?? []),
    statusTagSlugs: normalizeSlugList(filters.statusTagSlugs ?? []),
    tagMode: filters.tagMode ?? "all",
    statusMode: filters.statusMode ?? "all",
  };
}

export function drillMatchesFilters(drill: DrillSummary, filters: DrillFilters): boolean {
  const methodSlugs = drill.trainingMethods.map((method) => method.slug);
  const tagSlugs = [...drill.tags, ...drill.customTags].map((tag) => tag.slug);
  const statusSlugs = drill.statusTags.map((status) => status.slug);
  const haystack = buildDrillSearchHaystack(drill);

  if (filters.methodSlugs.length > 0 && !hasAny(methodSlugs, filters.methodSlugs)) {
    return false;
  }

  if (filters.tagSlugs.length > 0 && !matchesListFilter(tagSlugs, filters.tagSlugs, filters.tagMode)) {
    return false;
  }

  if (
    filters.statusTagSlugs.length > 0 &&
    !matchesListFilter(statusSlugs, filters.statusTagSlugs, filters.statusMode)
  ) {
    return false;
  }

  return filters.keywords.every((keyword) => haystack.includes(keyword.toLowerCase()));
}

// Step 3 favors one simple read model over clever SQL composition. Once the
// product has real scale, these filters can move into SQL without changing API
// response contracts.
async function loadDrillSummaries(userId: string): Promise<DrillSummary[]> {
  const drillRows = await db
    .select()
    .from(drills)
    .where(eq(drills.userId, userId))
    .orderBy(desc(drills.createdAt), asc(drills.title));
  const drillIds = drillRows.map((drill) => drill.id);
  const [methodsByDrillId, tagsByDrillId, statusTagsByDrillId] = await Promise.all([
    loadTrainingMethodsByDrillId(drillIds),
    loadTagsByDrillId(userId, drillIds),
    loadStatusTagsByDrillId(drillIds),
  ]);

  return drillRows.map((drill) => {
    const drillTags = tagsByDrillId.get(drill.id) ?? [];

    return {
      id: drill.id,
      title: drill.title,
      summary: drill.summary,
      trainingMethods: methodsByDrillId.get(drill.id) ?? [],
      tags: drillTags.filter((tag) => tag.kind === "standard"),
      customTags: drillTags.filter((tag) => tag.kind === "custom"),
      statusTags: statusTagsByDrillId.get(drill.id) ?? [],
      createdAt: drill.createdAt,
      updatedAt: drill.updatedAt,
    };
  });
}

async function loadTrainingMethodsByDrillId(drillIds: string[]): Promise<Map<string, TrainingMethodDto[]>> {
  if (drillIds.length === 0) return new Map();

  const rows = await db
    .select({
      drillId: drillTrainingMethods.drillId,
      id: trainingMethods.id,
      name: trainingMethods.name,
      slug: trainingMethods.slug,
      iconKey: trainingMethods.iconKey,
      sortOrder: trainingMethods.sortOrder,
    })
    .from(drillTrainingMethods)
    .innerJoin(trainingMethods, eq(drillTrainingMethods.trainingMethodId, trainingMethods.id))
    .where(and(inArray(drillTrainingMethods.drillId, drillIds), eq(trainingMethods.active, true)))
    .orderBy(asc(trainingMethods.sortOrder), asc(trainingMethods.name));

  return groupByDrillId(rows, (row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    iconKey: row.iconKey,
    sortOrder: row.sortOrder,
  }));
}

async function loadTrainingMethodsForDrill(drillId: string): Promise<TrainingMethodDto[]> {
  const rows = await db
    .select({
      id: trainingMethods.id,
      name: trainingMethods.name,
      slug: trainingMethods.slug,
      iconKey: trainingMethods.iconKey,
      sortOrder: trainingMethods.sortOrder,
    })
    .from(drillTrainingMethods)
    .innerJoin(trainingMethods, eq(drillTrainingMethods.trainingMethodId, trainingMethods.id))
    .where(eq(drillTrainingMethods.drillId, drillId))
    .orderBy(asc(trainingMethods.sortOrder), asc(trainingMethods.name));

  return rows;
}

async function loadTagsByDrillId(userId: string, drillIds: string[]): Promise<Map<string, TagDto[]>> {
  if (drillIds.length === 0) return new Map();

  const rows = await db
    .select({
      drillId: drillTags.drillId,
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      kind: tags.kind,
      sortOrder: tags.sortOrder,
      categoryId: tagCategories.id,
      categoryName: tagCategories.name,
      categorySlug: tagCategories.slug,
    })
    .from(drillTags)
    .innerJoin(tags, eq(drillTags.tagId, tags.id))
    .leftJoin(tagCategories, eq(tags.categoryId, tagCategories.id))
    .where(
      and(
        inArray(drillTags.drillId, drillIds),
        eq(tags.active, true),
        or(isNull(tags.userId), eq(tags.userId, userId)),
      ),
    )
    .orderBy(asc(tagCategories.sortOrder), asc(tags.sortOrder), asc(tags.name));

  return groupByDrillId(rows, (row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind === "custom" ? "custom" : "standard",
    sortOrder: row.sortOrder,
    category:
      row.categoryId && row.categoryName && row.categorySlug
        ? {
            id: row.categoryId,
            name: row.categoryName,
            slug: row.categorySlug,
          }
        : null,
  }));
}

async function loadTagsForDrill(userId: string, drillId: string): Promise<TagDto[]> {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      kind: tags.kind,
      sortOrder: tags.sortOrder,
      categoryId: tagCategories.id,
      categoryName: tagCategories.name,
      categorySlug: tagCategories.slug,
    })
    .from(drillTags)
    .innerJoin(tags, eq(drillTags.tagId, tags.id))
    .leftJoin(tagCategories, eq(tags.categoryId, tagCategories.id))
    .where(
      and(
        eq(drillTags.drillId, drillId),
        eq(tags.active, true),
        or(isNull(tags.userId), eq(tags.userId, userId)),
      ),
    )
    .orderBy(asc(tagCategories.sortOrder), asc(tags.sortOrder), asc(tags.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind === "custom" ? "custom" : "standard",
    sortOrder: row.sortOrder,
    category:
      row.categoryId && row.categoryName && row.categorySlug
        ? {
            id: row.categoryId,
            name: row.categoryName,
            slug: row.categorySlug,
          }
        : null,
  }));
}

async function loadStatusTagsByDrillId(drillIds: string[]): Promise<Map<string, StatusTagDto[]>> {
  if (drillIds.length === 0) return new Map();

  const rows = await db
    .select({
      drillId: drillStatusTags.drillId,
      id: statusTags.id,
      name: statusTags.name,
      slug: statusTags.slug,
      sortOrder: statusTags.sortOrder,
    })
    .from(drillStatusTags)
    .innerJoin(statusTags, eq(drillStatusTags.statusTagId, statusTags.id))
    .where(and(inArray(drillStatusTags.drillId, drillIds), eq(statusTags.active, true)))
    .orderBy(asc(statusTags.sortOrder), asc(statusTags.name));

  return groupByDrillId(rows, (row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sortOrder,
  }));
}

async function loadStatusTagsForDrill(drillId: string): Promise<StatusTagDto[]> {
  const rows = await db
    .select({
      id: statusTags.id,
      name: statusTags.name,
      slug: statusTags.slug,
      sortOrder: statusTags.sortOrder,
    })
    .from(drillStatusTags)
    .innerJoin(statusTags, eq(drillStatusTags.statusTagId, statusTags.id))
    .where(eq(drillStatusTags.drillId, drillId))
    .orderBy(asc(statusTags.sortOrder), asc(statusTags.name));

  return rows;
}

async function loadStepsByDrillId(drillIds: string[]): Promise<Map<string, DrillStepDto[]>> {
  if (drillIds.length === 0) return new Map();

  const rows = await db
    .select({
      drillId: drillSteps.drillId,
      id: drillSteps.id,
      position: drillSteps.position,
      body: drillSteps.body,
    })
    .from(drillSteps)
    .where(inArray(drillSteps.drillId, drillIds))
    .orderBy(asc(drillSteps.position));

  return groupByDrillId(rows, (row) => ({
    id: row.id,
    position: row.position,
    body: row.body,
  }));
}

async function loadStepsForDrill(drillId: string): Promise<DrillStepDto[]> {
  const rows = await db
    .select({
      id: drillSteps.id,
      position: drillSteps.position,
      body: drillSteps.body,
    })
    .from(drillSteps)
    .where(eq(drillSteps.drillId, drillId))
    .orderBy(asc(drillSteps.position));

  return rows;
}

function groupByDrillId<TItem, TRow extends { drillId: string }>(
  rows: TRow[],
  mapRow: (row: TRow) => TItem,
): Map<string, TItem[]> {
  const result = new Map<string, TItem[]>();

  for (const row of rows) {
    const items = result.get(row.drillId) ?? [];
    items.push(mapRow(row));
    result.set(row.drillId, items);
  }

  return result;
}

function buildDrillSearchHaystack(drill: DrillSummary): string {
  return [
    drill.title,
    drill.summary,
    ...drill.trainingMethods.map((method) => method.name),
    ...drill.tags.map((tag) => tag.name),
    ...drill.customTags.map((tag) => tag.name),
    ...drill.statusTags.map((status) => status.name),
  ]
    .join(" ")
    .toLowerCase();
}

function matchesListFilter(values: string[], selectedValues: string[], mode: FilterMode): boolean {
  if (selectedValues.length === 0) return true;
  if (mode === "any") return hasAny(values, selectedValues);
  return selectedValues.every((selectedValue) => values.includes(selectedValue));
}

function hasAny(values: string[], selectedValues: string[]): boolean {
  return selectedValues.some((selectedValue) => values.includes(selectedValue));
}

function normalizeStringList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function normalizeSlugList(values: string[]): string[] {
  return normalizeStringList(values).map((value) => value.replace(/\s+/g, "-"));
}
