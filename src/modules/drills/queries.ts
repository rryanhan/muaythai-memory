import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
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

type DrillSummaryRow = Pick<
  typeof drills.$inferSelect,
  "id" | "title" | "summary" | "createdAt" | "updatedAt"
>;
type DrillDetailQueryRow = Omit<DrillDetail, "createdAt" | "updatedAt"> & {
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type DrillListLoadOptions = {
  includeTags?: boolean;
  includeStatusTags?: boolean;
};

type DrillQueryDatabase = Pick<typeof db, "execute">;

// Returns list-ready drill summaries. Full steps are intentionally left out so
// library/profile/network screens can load quickly on mobile.
export async function listDrills(
  userId: string,
  filters: Partial<DrillFilters> = {},
  options: DrillListLoadOptions = {},
): Promise<DrillListResponse> {
  const normalizedFilters = normalizeDrillFilters(filters);
  const keywordSearchNeedsAllLabels = normalizedFilters.keywords.length > 0;
  const allDrills = await loadDrillSummaries(userId, undefined, {
    includeTags:
      (options.includeTags ?? true) ||
      keywordSearchNeedsAllLabels ||
      normalizedFilters.tagSlugs.length > 0,
    includeStatusTags:
      (options.includeStatusTags ?? true) ||
      keywordSearchNeedsAllLabels ||
      normalizedFilters.statusTagSlugs.length > 0,
  });
  const filteredDrills = allDrills.filter((drill) => drillMatchesFilters(drill, normalizedFilters));

  return {
    drills: filteredDrills,
    total: filteredDrills.length,
    filters: normalizedFilters,
  };
}

// Detail loading is separate from list loading because graph nodes should open
// the full drill only after the user taps one.
export async function getDrillById(
  userId: string,
  id: string,
  options: { database?: DrillQueryDatabase } = {},
): Promise<DrillDetail | null> {
  const database = options.database ?? db;
  const [detail] = await database.execute<DrillDetailQueryRow>(sql`
    select
      ${drills.id} as "id",
      ${drills.title} as "title",
      ${drills.summary} as "summary",
      ${drills.notes} as "notes",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', ${trainingMethods.id},
            'name', ${trainingMethods.name},
            'slug', ${trainingMethods.slug},
            'iconKey', ${trainingMethods.iconKey},
            'sortOrder', ${trainingMethods.sortOrder}
          )
          order by ${trainingMethods.sortOrder}, ${trainingMethods.name}
        )
        from ${drillTrainingMethods}
        inner join ${trainingMethods}
          on ${trainingMethods.id} = ${drillTrainingMethods.trainingMethodId}
        where ${drillTrainingMethods.drillId} = ${drills.id}
          and ${trainingMethods.active} = true
      ), '[]'::jsonb) as "trainingMethods",
      tag_payload."tags" as "tags",
      tag_payload."customTags" as "customTags",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', ${statusTags.id},
            'name', ${statusTags.name},
            'slug', ${statusTags.slug},
            'sortOrder', ${statusTags.sortOrder}
          )
          order by ${statusTags.sortOrder}, ${statusTags.name}
        )
        from ${drillStatusTags}
        inner join ${statusTags}
          on ${statusTags.id} = ${drillStatusTags.statusTagId}
        where ${drillStatusTags.drillId} = ${drills.id}
          and ${statusTags.active} = true
      ), '[]'::jsonb) as "statusTags",
      ${drills.createdAt} as "createdAt",
      ${drills.updatedAt} as "updatedAt",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', ${drillSteps.id},
            'position', ${drillSteps.position},
            'body', ${drillSteps.body}
          )
          order by ${drillSteps.position}
        )
        from ${drillSteps}
        where ${drillSteps.drillId} = ${drills.id}
      ), '[]'::jsonb) as "steps"
    from ${drills}
    cross join lateral (
      select
        coalesce(
          jsonb_agg(
            tag_row."tag"
            order by tag_row."categorySortOrder", tag_row."sortOrder", tag_row."name"
          ) filter (where tag_row."kind" = 'standard'),
          '[]'::jsonb
        ) as "tags",
        coalesce(
          jsonb_agg(
            tag_row."tag"
            order by tag_row."categorySortOrder", tag_row."sortOrder", tag_row."name"
          ) filter (where tag_row."kind" = 'custom'),
          '[]'::jsonb
        ) as "customTags"
      from (
        select
          case when ${tags.kind} = 'custom' then 'custom' else 'standard' end as "kind",
          jsonb_build_object(
            'id', ${tags.id},
            'name', ${tags.name},
            'slug', ${tags.slug},
            'kind', case when ${tags.kind} = 'custom' then 'custom' else 'standard' end,
            'sortOrder', ${tags.sortOrder},
            'category', case
              when ${tagCategories.id} is not null
                and ${tagCategories.name} <> ''
                and ${tagCategories.slug} <> ''
              then jsonb_build_object(
                'id', ${tagCategories.id},
                'name', ${tagCategories.name},
                'slug', ${tagCategories.slug}
              )
              else null
            end
          ) as "tag",
          ${tagCategories.sortOrder} as "categorySortOrder",
          ${tags.sortOrder} as "sortOrder",
          ${tags.name} as "name"
        from ${drillTags}
        inner join ${tags} on ${tags.id} = ${drillTags.tagId}
        left join ${tagCategories} on ${tagCategories.id} = ${tags.categoryId}
        where ${drillTags.drillId} = ${drills.id}
          and ${tags.active} = true
          and (${tags.userId} is null or ${tags.userId} = ${drills.userId})
      ) as tag_row
    ) as tag_payload
    where ${drills.id} = ${id}
      and ${drills.userId} = ${userId}
    limit 1
  `);

  return detail
    ? {
        ...detail,
        createdAt: toDate(detail.createdAt),
        updatedAt: toDate(detail.updatedAt),
      }
    : null;
}

export async function getOwnedDrillHeader(
  userId: string,
  id: string,
): Promise<Pick<DrillDetail, "id" | "title"> | null> {
  const [row] = await db
    .select({ id: drills.id, title: drills.title })
    .from(drills)
    .where(and(eq(drills.id, id), eq(drills.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getDrillSummariesByOwnerPairs(
  pairs: Array<{ ownerId: string; drillId: string }>,
  options: { includeStatusTags?: boolean } = {},
): Promise<DrillSummary[]> {
  if (pairs.length === 0) return [];

  const uniquePairs = [...new Map(
    pairs.map((pair) => [`${pair.ownerId}:${pair.drillId}`, pair]),
  ).values()];
  const drillRows = await db
    .select({
      id: drills.id,
      userId: drills.userId,
      title: drills.title,
      summary: drills.summary,
      createdAt: drills.createdAt,
      updatedAt: drills.updatedAt,
    })
    .from(drills)
    .where(or(...uniquePairs.map((pair) => and(
      eq(drills.id, pair.drillId),
      eq(drills.userId, pair.ownerId),
    ))));
  const summaries = await hydrateDrillSummaries(
    drillRows,
    (drillIds) => loadTagsByDrillOwner(drillIds),
    { includeStatusTags: options.includeStatusTags ?? true },
  );
  const summaryById = new Map(summaries.map((drill) => [drill.id, drill]));
  const validatedPairs = new Set(
    drillRows.map((drill) => `${drill.userId}:${drill.id}`),
  );

  return pairs
    .map((pair) => validatedPairs.has(`${pair.ownerId}:${pair.drillId}`)
      ? summaryById.get(pair.drillId)
      : undefined)
    .filter((drill): drill is DrillSummary => Boolean(drill));
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
async function loadDrillSummaries(
  userId: string,
  selectedDrillIds?: string[],
  options: DrillListLoadOptions = {},
): Promise<DrillSummary[]> {
  const drillRows = await db
    .select({
      id: drills.id,
      title: drills.title,
      summary: drills.summary,
      createdAt: drills.createdAt,
      updatedAt: drills.updatedAt,
    })
    .from(drills)
    .where(and(
      eq(drills.userId, userId),
      selectedDrillIds ? inArray(drills.id, selectedDrillIds) : undefined,
    ))
    .orderBy(desc(drills.createdAt), asc(drills.title));
  return hydrateDrillSummaries(
    drillRows,
    (drillIds) => loadTagsByDrillId(userId, drillIds),
    options,
  );
}

async function hydrateDrillSummaries(
  drillRows: DrillSummaryRow[],
  loadTags: (drillIds: string[]) => Promise<Map<string, TagDto[]>>,
  options: DrillListLoadOptions = {},
): Promise<DrillSummary[]> {
  const drillIds = drillRows.map((drill) => drill.id);
  const [methodsByDrillId, tagsByDrillId, statusTagsByDrillId] = await Promise.all([
    loadTrainingMethodsByDrillId(drillIds),
    options.includeTags === false
      ? Promise.resolve(new Map<string, TagDto[]>())
      : loadTags(drillIds),
    options.includeStatusTags === false
      ? Promise.resolve(new Map<string, StatusTagDto[]>())
      : loadStatusTagsByDrillId(drillIds),
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

async function loadTagsByDrillOwner(drillIds: string[]): Promise<Map<string, TagDto[]>> {
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
    .innerJoin(drills, eq(drillTags.drillId, drills.id))
    .innerJoin(tags, eq(drillTags.tagId, tags.id))
    .leftJoin(tagCategories, eq(tags.categoryId, tagCategories.id))
    .where(and(
      inArray(drillTags.drillId, drillIds),
      eq(tags.active, true),
      or(isNull(tags.userId), eq(tags.userId, drills.userId)),
    ))
    .orderBy(asc(tagCategories.sortOrder), asc(tags.sortOrder), asc(tags.name));

  return groupTagRows(rows);
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

function groupTagRows(rows: Array<{
  drillId: string;
  id: string;
  name: string;
  slug: string;
  kind: string;
  sortOrder: number;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
}>): Map<string, TagDto[]> {
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

  return groupTagRows(rows);
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

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeStringList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function normalizeSlugList(values: string[]): string[] {
  return normalizeStringList(values).map((value) => value.replace(/\s+/g, "-"));
}
