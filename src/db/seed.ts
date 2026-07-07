import { and, eq, isNull, notInArray } from "drizzle-orm";
import { postgresClient, db } from "./client";
import { statusTags, tagCategories, tags, trainingMethods } from "./schema";
import {
  standardTagSeeds,
  statusTagSeeds,
  tagCategorySeeds,
  trainingMethodSeeds,
} from "../modules/taxonomy/seed-data";

async function seedTrainingMethods() {
  for (const method of trainingMethodSeeds) {
    await db
      .insert(trainingMethods)
      .values(method)
      .onConflictDoUpdate({
        target: trainingMethods.slug,
        set: {
          name: method.name,
          iconKey: method.iconKey,
          sortOrder: method.sortOrder,
          active: true,
          updatedAt: new Date(),
        },
      });
  }
}

async function seedTagCategories() {
  for (const category of tagCategorySeeds) {
    await db
      .insert(tagCategories)
      .values(category)
      .onConflictDoUpdate({
        target: tagCategories.slug,
        set: {
          name: category.name,
          sortOrder: category.sortOrder,
          active: true,
          updatedAt: new Date(),
        },
      });
  }

  const activeCategorySlugs = tagCategorySeeds.map((category) => category.slug);

  await db
    .update(tagCategories)
    .set({
      active: false,
      updatedAt: new Date(),
    })
    .where(notInArray(tagCategories.slug, activeCategorySlugs));
}

async function seedStandardTags() {
  const categories = await db.select().from(tagCategories);
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));

  for (const tag of standardTagSeeds) {
    const category = categoryBySlug.get(tag.categorySlug);
    if (!category) throw new Error(`Missing tag category: ${tag.categorySlug}`);

    const [existingTag] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.slug, tag.slug), isNull(tags.userId)))
      .limit(1);

    if (existingTag) {
      await db
        .update(tags)
        .set({
          name: tag.name,
          categoryId: category.id,
          kind: "standard",
          sortOrder: tag.sortOrder,
          active: true,
          updatedAt: new Date(),
        })
        .where(eq(tags.id, existingTag.id));
    } else {
      await db.insert(tags).values({
        name: tag.name,
        slug: tag.slug,
        categoryId: category.id,
        kind: "standard",
        sortOrder: tag.sortOrder,
      });
    }
  }

  const activeStandardTagSlugs = standardTagSeeds.map((tag) => tag.slug);

  await db
    .update(tags)
    .set({
      active: false,
      updatedAt: new Date(),
    })
    .where(and(eq(tags.kind, "standard"), isNull(tags.userId), notInArray(tags.slug, activeStandardTagSlugs)));
}

async function seedStatusTags() {
  for (const status of statusTagSeeds) {
    await db
      .insert(statusTags)
      .values(status)
      .onConflictDoUpdate({
        target: statusTags.slug,
        set: {
          name: status.name,
          sortOrder: status.sortOrder,
          active: true,
          updatedAt: new Date(),
        },
      });
  }
}

async function assertSeedCounts() {
  const [methodCount, categoryCount, tagCount, statusCount] = await Promise.all([
    db.select().from(trainingMethods).where(eq(trainingMethods.active, true)),
    db.select().from(tagCategories).where(eq(tagCategories.active, true)),
    db
      .select()
      .from(tags)
      .where(and(eq(tags.kind, "standard"), isNull(tags.userId), eq(tags.active, true))),
    db.select().from(statusTags).where(eq(statusTags.active, true)),
  ]);

  console.log(
    `Seed complete: ${methodCount.length} active training methods, ${categoryCount.length} active tag categories, ${tagCount.length} active standard tags, ${statusCount.length} active status tags.`,
  );
}

async function main() {
  await seedTrainingMethods();
  await seedTagCategories();
  await seedStandardTags();
  await seedStatusTags();
  await assertSeedCounts();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgresClient.end();
  });
