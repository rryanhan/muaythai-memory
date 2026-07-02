import { config } from "dotenv";
import { and, eq, isNull } from "drizzle-orm";
import { db, postgresClient } from "./client";
import { statusTags, tagCategories, tags, trainingMethods } from "./schema";
import {
  standardTagSeeds,
  statusTagSeeds,
  tagCategorySeeds,
  trainingMethodSeeds,
} from "../modules/taxonomy/seed-data";

config({ path: ".env.local" });

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const [methods, categories, standardTags, statuses] = await Promise.all([
    db.select().from(trainingMethods),
    db.select().from(tagCategories),
    db.select().from(tags).where(and(eq(tags.kind, "standard"), isNull(tags.userId))),
    db.select().from(statusTags),
  ]);

  const methodNames = new Set(methods.map((method) => method.name));
  const standardTagNames = new Set(standardTags.map((tag) => tag.name));

  expect(methods.length === trainingMethodSeeds.length, `Expected ${trainingMethodSeeds.length} training methods, got ${methods.length}`);
  expect(categories.length === tagCategorySeeds.length, `Expected ${tagCategorySeeds.length} tag categories, got ${categories.length}`);
  expect(standardTags.length === standardTagSeeds.length, `Expected ${standardTagSeeds.length} standard tags, got ${standardTags.length}`);
  expect(statuses.length === statusTagSeeds.length, `Expected ${statusTagSeeds.length} status tags, got ${statuses.length}`);

  expect(methodNames.has("Clinch"), "Expected Clinch to exist as a Training Method");
  expect(!standardTagNames.has("Clinch"), "Clinch should not be a standard tag");
  expect(methodNames.has("Technical Work"), "Expected Technical Work to exist as a Training Method");
  expect(!methodNames.has("Shadowboxing"), "Shadowboxing should not be a Training Method");
  expect(standardTagNames.has("Shadowboxing"), "Expected Shadowboxing to exist as a standard tag");

  const sweepTags = standardTags.filter((tag) => tag.name.toLowerCase().includes("sweep"));
  expect(sweepTags.length === 1 && sweepTags[0]?.name === "Sweep", "Sweep should be the only sweep standard tag");

  const coreIdeaColumns = await postgresClient<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name ilike '%core%idea%'
    order by table_name, ordinal_position
  `;
  expect(coreIdeaColumns.length === 0, "Core Idea should not be part of the active schema");

  console.log(
    `Taxonomy verification passed: ${methods.length} methods, ${categories.length} categories, ${standardTags.length} standard tags, ${statuses.length} status tags.`,
  );
  console.log("Verified: Core Idea absent, Clinch is method-only, Shadowboxing is tag-only, Sweep is the only sweep tag.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgresClient.end();
  });
