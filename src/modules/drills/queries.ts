import { and, eq, sql, type SQL } from "drizzle-orm";
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
import type { DrillDetail, DrillFilters, DrillListResponse, DrillSummary, FilterMode } from "./contracts";

type DrillSummaryQueryRow = Omit<DrillSummary, "createdAt" | "updatedAt"> & {
  userId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};
type DrillDetailQueryRow = Omit<DrillDetail, "createdAt" | "updatedAt"> & {
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DrillQueryDatabase = Pick<typeof db, "execute">;

export type DrillListLoadOptions = {
  includeTags?: boolean;
  includeStatusTags?: boolean;
  database?: DrillQueryDatabase;
};

// Returns list-ready drill summaries. Full steps are intentionally left out so
// library/profile/network screens can load quickly on mobile.
export async function listDrills(
  userId: string,
  filters: Partial<DrillFilters> = {},
  options: DrillListLoadOptions = {},
): Promise<DrillListResponse> {
  const normalizedFilters = normalizeDrillFilters(filters);
  const keywordSearchNeedsAllLabels = normalizedFilters.keywords.length > 0;
  const allDrills = await loadDrillSummaries(userId, {
    includeTags:
      (options.includeTags ?? true) ||
      keywordSearchNeedsAllLabels ||
      normalizedFilters.tagSlugs.length > 0,
    includeStatusTags:
      (options.includeStatusTags ?? true) ||
      keywordSearchNeedsAllLabels ||
      normalizedFilters.statusTagSlugs.length > 0,
    database: options.database,
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
  options: { includeStatusTags?: boolean; database?: DrillQueryDatabase } = {},
): Promise<DrillSummary[]> {
  if (pairs.length === 0) return [];

  const uniquePairs = [...new Map(
    pairs.map((pair) => [`${pair.ownerId}:${pair.drillId}`, pair]),
  ).values()];
  const requestedPairs = sql.join(
    uniquePairs.map((pair) => sql`(${pair.ownerId}::uuid, ${pair.drillId}::uuid)`),
    sql`, `,
  );
  const rows = await executeDrillSummaryQuery(
    options.database ?? db,
    sql`
      select
        ${drills.id} as "id",
        ${drills.userId} as "userId",
        ${drills.title} as "title",
        ${drills.summary} as "summary",
        ${drills.createdAt} as "createdAt",
        ${drills.updatedAt} as "updatedAt"
      from ${drills}
      inner join (values ${requestedPairs}) as requested_pairs("ownerId", "drillId")
        on requested_pairs."drillId" = ${drills.id}
        and requested_pairs."ownerId" = ${drills.userId}
    `,
    {
      includeTags: true,
      includeStatusTags: options.includeStatusTags ?? true,
    },
  );
  const summaryByOwnerPair = new Map(
    rows.map((row) => [`${row.userId}:${row.id}`, toDrillSummary(row)]),
  );

  return pairs
    .map((pair) => summaryByOwnerPair.get(`${pair.ownerId}:${pair.drillId}`))
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

// Keep the shared filter contract in TypeScript for now, while PostgreSQL
// assembles each relation-complete summary snapshot in one statement.
async function loadDrillSummaries(
  userId: string,
  options: DrillListLoadOptions = {},
): Promise<DrillSummary[]> {
  const rows = await executeDrillSummaryQuery(
    options.database ?? db,
    sql`
      select
        ${drills.id} as "id",
        ${drills.userId} as "userId",
        ${drills.title} as "title",
        ${drills.summary} as "summary",
        ${drills.createdAt} as "createdAt",
        ${drills.updatedAt} as "updatedAt"
      from ${drills}
      where ${drills.userId} = ${userId}
    `,
    {
      includeTags: options.includeTags ?? true,
      includeStatusTags: options.includeStatusTags ?? true,
    },
  );
  return rows.map(toDrillSummary);
}

async function executeDrillSummaryQuery(
  database: DrillQueryDatabase,
  ownedDrillsQuery: SQL,
  options: { includeTags: boolean; includeStatusTags: boolean },
): Promise<DrillSummaryQueryRow[]> {
  const tagCtes = options.includeTags ? sql`
    , tag_rows as (
      select
        ${drillTags.drillId} as "drillId",
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
      from owned_drills
      inner join ${drillTags}
        on ${drillTags.drillId} = owned_drills."id"
      inner join ${tags}
        on ${tags.id} = ${drillTags.tagId}
      left join ${tagCategories}
        on ${tagCategories.id} = ${tags.categoryId}
      where ${tags.active} = true
        and (${tags.userId} is null or ${tags.userId} = owned_drills."userId")
    ),
    tag_payload as (
      select
        tag_rows."drillId",
        coalesce(
          jsonb_agg(
            tag_rows."tag"
            order by tag_rows."categorySortOrder", tag_rows."sortOrder", tag_rows."name"
          ) filter (where tag_rows."kind" = 'standard'),
          '[]'::jsonb
        ) as "tags",
        coalesce(
          jsonb_agg(
            tag_rows."tag"
            order by tag_rows."categorySortOrder", tag_rows."sortOrder", tag_rows."name"
          ) filter (where tag_rows."kind" = 'custom'),
          '[]'::jsonb
        ) as "customTags"
      from tag_rows
      group by tag_rows."drillId"
    )
  ` : sql.empty();
  const statusCte = options.includeStatusTags ? sql`
    , status_payload as (
      select
        ${drillStatusTags.drillId} as "drillId",
        jsonb_agg(
          jsonb_build_object(
            'id', ${statusTags.id},
            'name', ${statusTags.name},
            'slug', ${statusTags.slug},
            'sortOrder', ${statusTags.sortOrder}
          )
          order by ${statusTags.sortOrder}, ${statusTags.name}
        ) as "statusTags"
      from owned_drills
      inner join ${drillStatusTags}
        on ${drillStatusTags.drillId} = owned_drills."id"
      inner join ${statusTags}
        on ${statusTags.id} = ${drillStatusTags.statusTagId}
      where ${statusTags.active} = true
      group by ${drillStatusTags.drillId}
    )
  ` : sql.empty();
  const tagProjection = options.includeTags
    ? sql`coalesce(tag_payload."tags", '[]'::jsonb)`
    : sql`'[]'::jsonb`;
  const customTagProjection = options.includeTags
    ? sql`coalesce(tag_payload."customTags", '[]'::jsonb)`
    : sql`'[]'::jsonb`;
  const statusProjection = options.includeStatusTags
    ? sql`coalesce(status_payload."statusTags", '[]'::jsonb)`
    : sql`'[]'::jsonb`;
  const tagJoin = options.includeTags ? sql`
    left join tag_payload on tag_payload."drillId" = owned_drills."id"
  ` : sql.empty();
  const statusJoin = options.includeStatusTags ? sql`
    left join status_payload on status_payload."drillId" = owned_drills."id"
  ` : sql.empty();

  return database.execute<DrillSummaryQueryRow>(sql`
    with owned_drills as materialized (
      ${ownedDrillsQuery}
    ),
    method_payload as (
      select
        ${drillTrainingMethods.drillId} as "drillId",
        jsonb_agg(
          jsonb_build_object(
            'id', ${trainingMethods.id},
            'name', ${trainingMethods.name},
            'slug', ${trainingMethods.slug},
            'iconKey', ${trainingMethods.iconKey},
            'sortOrder', ${trainingMethods.sortOrder}
          )
          order by ${trainingMethods.sortOrder}, ${trainingMethods.name}
        ) as "trainingMethods"
      from owned_drills
      inner join ${drillTrainingMethods}
        on ${drillTrainingMethods.drillId} = owned_drills."id"
      inner join ${trainingMethods}
        on ${trainingMethods.id} = ${drillTrainingMethods.trainingMethodId}
      where ${trainingMethods.active} = true
      group by ${drillTrainingMethods.drillId}
    )
    ${tagCtes}
    ${statusCte}
    select
      owned_drills."id",
      owned_drills."userId",
      owned_drills."title",
      owned_drills."summary",
      coalesce(method_payload."trainingMethods", '[]'::jsonb) as "trainingMethods",
      ${tagProjection} as "tags",
      ${customTagProjection} as "customTags",
      ${statusProjection} as "statusTags",
      owned_drills."createdAt",
      owned_drills."updatedAt"
    from owned_drills
    left join method_payload on method_payload."drillId" = owned_drills."id"
    ${tagJoin}
    ${statusJoin}
    order by owned_drills."createdAt" desc, owned_drills."title" asc
  `);
}

function toDrillSummary(row: DrillSummaryQueryRow): DrillSummary {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    trainingMethods: row.trainingMethods,
    tags: row.tags,
    customTags: row.customTags,
    statusTags: row.statusTags,
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
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
