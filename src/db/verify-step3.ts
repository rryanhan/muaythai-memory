import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getDrillById, listDrills } from "@/modules/drills/queries";
import { graphResponseSchema } from "@/modules/graph/contracts";
import { getMuayThaiGraph } from "@/modules/graph/queries";
import { taxonomyResponseSchema } from "@/modules/taxonomy/contracts";
import { getTaxonomy } from "@/modules/taxonomy/queries";
import { db, postgresClient } from "./client";
import { drills, users } from "./schema";

config({ path: ".env.local" });

// This script verifies the read model Step 3 needs before the frontend starts
// replacing wireframe data with API calls.
function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(drills, eq(drills.userId, users.id))
    .limit(1);
  if (!owner) throw new Error("Expected at least one user with seeded drills.");

  const taxonomy = taxonomyResponseSchema.parse(await getTaxonomy(owner.id));
  const standardTagNames = new Set(taxonomy.standardTags.map((tag) => tag.name));
  const methodNames = new Set(taxonomy.trainingMethods.map((method) => method.name));
  const statusBySlug = new Map(taxonomy.statusTags.map((status) => [status.slug, status.name]));

  expect(taxonomy.trainingMethods.length === 5, `Expected 5 training methods, got ${taxonomy.trainingMethods.length}`);
  expect(taxonomy.tagCategories.length === 10, `Expected 10 tag categories, got ${taxonomy.tagCategories.length}`);
  expect(taxonomy.standardTags.length === 29, `Expected 29 standard tags, got ${taxonomy.standardTags.length}`);
  expect(taxonomy.statusTags.length === 2, `Expected 2 Saved Lists, got ${taxonomy.statusTags.length}`);
  expect(statusBySlug.get("starred") === "Favourite", "Favourite must retain the starred backend slug.");
  expect(statusBySlug.get("drill-back-in") === "Drill Back In", "Drill Back In must remain active.");
  expect(methodNames.has("Clinch"), "Clinch must remain a Training Method.");
  expect(!standardTagNames.has("Clinch"), "Clinch must not be a standard tag.");
  expect(!methodNames.has("Shadowboxing"), "Shadowboxing must not be a Training Method.");
  expect(standardTagNames.has("Shadowboxing"), "Shadowboxing must remain a standard tag.");
  expect(standardTagNames.has("Kick Check"), "Kick Check must be active.");
  expect(standardTagNames.has("Kick Catch"), "Kick Catch must be active.");
  expect(standardTagNames.has("Feint"), "Feint must be active.");
  expect(standardTagNames.has("Shift Kick"), "Shift Kick must be active.");
  expect(standardTagNames.has("Rear Kick"), "Rear Kick must be active.");
  expect(standardTagNames.has("Stance Switch"), "Stance Switch must be active.");
  expect(!standardTagNames.has("Switch Step"), "Switch Step should be retired in favor of Stance Switch.");
  expect(!standardTagNames.has("Check"), "Check should be replaced by Kick Check.");
  expect(!standardTagNames.has("Catch"), "Catch should be replaced by Kick Catch.");
  expect(!standardTagNames.has("Shell"), "Shell should not be active.");
  expect(!standardTagNames.has("Balance"), "Balance should not be active.");
  expect(!standardTagNames.has("Rhythm"), "Rhythm should not be active.");
  expect(!standardTagNames.has("Exits"), "Exits should not be active.");
  expect(taxonomy.standardTags.filter((tag) => tag.name.includes("Sweep")).length === 1, "Sweep should be the only sweep tag.");

  const drillList = await listDrills(owner.id);
  expect(drillList.total > 0, "Expected dev drills to be seeded.");
  expect(drillList.drills.every((drill) => drill.trainingMethods.length > 0), "Every drill should have a training method.");
  expect(drillList.drills.every((drill) => drill.tags.length > 0), "Every drill should have at least one standard tag.");

  const firstDrill = drillList.drills[0];
  if (!firstDrill) throw new Error("Expected a drill to verify detail loading.");

  const detail = await getDrillById(owner.id, firstDrill.id);
  expect(Boolean(detail), "Expected drill detail to load.");
  expect((detail?.steps.length ?? 0) > 0, "Expected drill detail to include steps.");
  expect(!JSON.stringify(detail).includes("coreIdea"), "Core Idea must not appear in drill API/query payloads.");

  const padWork = await listDrills(owner.id, { methodSlugs: ["pad-work"] });
  expect(padWork.total > 0, "Expected Pad Work filter to return drills.");
  expect(
    padWork.drills.every((drill) => drill.trainingMethods.some((method) => method.slug === "pad-work")),
    "Pad Work filter returned a drill without Pad Work.",
  );

  const uppercut = await listDrills(owner.id, { tagSlugs: ["uppercut"] });
  expect(uppercut.total > 0, "Expected Uppercut tag filter to return drills.");
  expect(
    uppercut.drills.every((drill) => [...drill.tags, ...drill.customTags].some((tag) => tag.slug === "uppercut")),
    "Uppercut tag filter returned a drill without Uppercut.",
  );

  const starred = await listDrills(owner.id, { statusTagSlugs: ["starred"] });
  expect(starred.total > 0, "Expected Favourite filter to return drills.");
  expect(
    starred.drills.every((drill) => drill.statusTags.some((status) => status.slug === "starred")),
    "Favourite filter returned a drill without the starred backend status.",
  );

  const graph = graphResponseSchema.parse(
    await getMuayThaiGraph(
      owner.id,
      { methodSlugs: ["pad-work"], tagSlugs: ["uppercut"], tagMode: "any" },
      { showTags: true },
    ),
  );
  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  expect(graph.nodes.length > 0, "Expected graph nodes.");
  expect(graph.edges.length > 0, "Expected graph edges.");
  expect(graph.edges.every((edge) => graphNodeIds.has(edge.from) && graphNodeIds.has(edge.to)), "Graph edges must reference valid nodes.");
  expect(graph.nodes.some((node) => node.type === "trainingMethod" && node.slug === "pad-work"), "Graph should include Pad Work node.");
  expect(graph.nodes.some((node) => node.type === "tag" && node.slug === "uppercut"), "Graph should include Uppercut tag node when tags are visible.");
  expect(!JSON.stringify(graph).includes("coreIdea"), "Core Idea must not appear in graph payloads.");

  console.log(
    `Step 3 verification passed: ${drillList.total} drills, ${taxonomy.standardTags.length} standard tags, ${graph.nodes.length} graph nodes, ${graph.edges.length} graph edges.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgresClient.end();
  });
