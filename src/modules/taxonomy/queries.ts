import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { statusTags, tagCategories, tags, trainingMethods } from "@/db/schema";
import type { TagCategoryDto, TagDto, TaxonomyResponse } from "./contracts";

type TaxonomyQueryDatabase = Pick<typeof db, "execute">;
type TaxonomyCategoryRow = Omit<TagCategoryDto, "tags">;
type TaxonomyTagRow = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  sortOrder: number;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
};
type TaxonomyQueryRow = {
  methodRows: TaxonomyResponse["trainingMethods"];
  categoryRows: TaxonomyCategoryRow[];
  standardTagRows: TaxonomyTagRow[];
  customTagRows: TaxonomyTagRow[];
  statusRows: TaxonomyResponse["statusTags"];
};

export type TaxonomyQueryOptions = {
  includeTagCategories?: boolean;
  includeStandardTags?: boolean;
  includeCustomTags?: boolean;
  includeStatusTags?: boolean;
  database?: TaxonomyQueryDatabase;
};

// Single read model for taxonomy screens, filter sheets, capture review, and
// graph controls. The database remains the source of truth for tag changes.
export async function getTaxonomy(
  userId: string,
  options: TaxonomyQueryOptions = {},
): Promise<TaxonomyResponse> {
  const database = options.database ?? db;
  const categoryRowsQuery = options.includeTagCategories === false
    ? sql`'[]'::jsonb`
    : sql`coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', ${tagCategories.id},
            'name', ${tagCategories.name},
            'slug', ${tagCategories.slug},
            'sortOrder', ${tagCategories.sortOrder}
          )
          order by ${tagCategories.sortOrder}, ${tagCategories.name}
        )
        from ${tagCategories}
        where ${tagCategories.active} = true
      ), '[]'::jsonb)`;
  const standardTagRowsQuery = options.includeStandardTags === false
    ? sql`'[]'::jsonb`
    : sql`coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', ${tags.id},
            'name', ${tags.name},
            'slug', ${tags.slug},
            'kind', ${tags.kind},
            'sortOrder', ${tags.sortOrder},
            'categoryId', ${tagCategories.id},
            'categoryName', ${tagCategories.name},
            'categorySlug', ${tagCategories.slug}
          )
          order by ${tagCategories.sortOrder}, ${tags.sortOrder}, ${tags.name}
        )
        from ${tags}
        left join ${tagCategories} on ${tagCategories.id} = ${tags.categoryId}
        where ${tags.kind} = 'standard'
          and ${tags.userId} is null
          and ${tags.active} = true
      ), '[]'::jsonb)`;
  const customTagRowsQuery = options.includeCustomTags === false
    ? sql`'[]'::jsonb`
    : sql`coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', ${tags.id},
            'name', ${tags.name},
            'slug', ${tags.slug},
            'kind', ${tags.kind},
            'sortOrder', ${tags.sortOrder},
            'categoryId', ${tagCategories.id},
            'categoryName', ${tagCategories.name},
            'categorySlug', ${tagCategories.slug}
          )
          order by ${tags.name}
        )
        from ${tags}
        left join ${tagCategories} on ${tagCategories.id} = ${tags.categoryId}
        where ${tags.kind} = 'custom'
          and ${tags.userId} = ${userId}
          and ${tags.active} = true
      ), '[]'::jsonb)`;
  const statusRowsQuery = options.includeStatusTags === false
    ? sql`'[]'::jsonb`
    : sql`coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', ${statusTags.id},
            'name', ${statusTags.name},
            'slug', ${statusTags.slug},
            'sortOrder', ${statusTags.sortOrder}
          )
          order by ${statusTags.sortOrder}, ${statusTags.name}
        )
        from ${statusTags}
        where ${statusTags.active} = true
      ), '[]'::jsonb)`;

  // Vercel instances intentionally use a one-connection pool, so five
  // independent selects would be five serial network round trips. Scalar
  // aggregates retain the old flat row shapes while returning one snapshot.
  const [snapshot] = await database.execute<TaxonomyQueryRow>(sql`
    select
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
        from ${trainingMethods}
        where ${trainingMethods.active} = true
      ), '[]'::jsonb) as "methodRows",
      ${categoryRowsQuery} as "categoryRows",
      ${standardTagRowsQuery} as "standardTagRows",
      ${customTagRowsQuery} as "customTagRows",
      ${statusRowsQuery} as "statusRows"
  `);
  if (!snapshot) throw new Error("Taxonomy could not be loaded.");

  const {
    methodRows,
    categoryRows,
    standardTagRows,
    customTagRows,
    statusRows,
  } = snapshot;
  const standardTags = standardTagRows.map(toTagDto);
  const customTags = customTagRows.map(toTagDto);
  const tagsByCategoryId = new Map<string, TagDto[]>();

  // Category rows stay visible even if a category has no active tags, which
  // keeps filter UI layout predictable while the taxonomy evolves.
  for (const tag of standardTags) {
    if (!tag.category) continue;
    const categoryTags = tagsByCategoryId.get(tag.category.id) ?? [];
    categoryTags.push(tag);
    tagsByCategoryId.set(tag.category.id, categoryTags);
  }

  const tagCategoryDtos: TagCategoryDto[] = categoryRows.map((category) => ({
    ...category,
    tags: tagsByCategoryId.get(category.id) ?? [],
  }));

  return {
    trainingMethods: methodRows,
    tagCategories: tagCategoryDtos,
    standardTags,
    customTags,
    statusTags: statusRows,
  };
}

function toTagDto(row: TaxonomyTagRow): TagDto {
  return {
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
  };
}
