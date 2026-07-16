import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { statusTags, tagCategories, tags, trainingMethods } from "@/db/schema";
import type { TagCategoryDto, TagDto, TaxonomyResponse } from "./contracts";

// Single read model for taxonomy screens, filter sheets, capture review, and
// graph controls. The database remains the source of truth for tag changes.
export async function getTaxonomy(userId: string): Promise<TaxonomyResponse> {
  const [methodRows, categoryRows, standardTagRows, customTagRows, statusRows] = await Promise.all([
    db
      .select({
        id: trainingMethods.id,
        name: trainingMethods.name,
        slug: trainingMethods.slug,
        iconKey: trainingMethods.iconKey,
        sortOrder: trainingMethods.sortOrder,
      })
      .from(trainingMethods)
      .where(eq(trainingMethods.active, true))
      .orderBy(asc(trainingMethods.sortOrder), asc(trainingMethods.name)),
    db
      .select({
        id: tagCategories.id,
        name: tagCategories.name,
        slug: tagCategories.slug,
        sortOrder: tagCategories.sortOrder,
      })
      .from(tagCategories)
      .where(eq(tagCategories.active, true))
      .orderBy(asc(tagCategories.sortOrder), asc(tagCategories.name)),
    db
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
      .from(tags)
      .leftJoin(tagCategories, eq(tags.categoryId, tagCategories.id))
      .where(and(eq(tags.kind, "standard"), isNull(tags.userId), eq(tags.active, true)))
      .orderBy(asc(tagCategories.sortOrder), asc(tags.sortOrder), asc(tags.name)),
    db
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
      .from(tags)
      .leftJoin(tagCategories, eq(tags.categoryId, tagCategories.id))
      .where(and(eq(tags.kind, "custom"), eq(tags.userId, userId), eq(tags.active, true)))
      .orderBy(asc(tags.name)),
    db
      .select({
        id: statusTags.id,
        name: statusTags.name,
        slug: statusTags.slug,
        sortOrder: statusTags.sortOrder,
      })
      .from(statusTags)
      .where(eq(statusTags.active, true))
      .orderBy(asc(statusTags.sortOrder), asc(statusTags.name)),
  ]);

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

function toTagDto(row: {
  id: string;
  name: string;
  slug: string;
  kind: string;
  sortOrder: number;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
}): TagDto {
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
