import {
  ApiError,
  buildDrillsApiPath,
  buildGraphApiPath,
  getDrill,
  getDrills,
  getGraph,
  getTaxonomy,
} from "./api";

// Verifies the frontend data layer against a running local Next server. This
// catches query-string mistakes, backend response drift, and parked fields like
// coreIdea accidentally returning to active payloads.
const baseUrl = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const taxonomy = await getTaxonomy({ baseUrl });
  const standardTagNames = new Set(taxonomy.standardTags.map((tag) => tag.name));
  const methodNames = new Set(taxonomy.trainingMethods.map((method) => method.name));

  expect(taxonomy.trainingMethods.length === 5, `Expected 5 training methods, got ${taxonomy.trainingMethods.length}`);
  expect(taxonomy.standardTags.length === 28, `Expected 28 standard tags, got ${taxonomy.standardTags.length}`);
  expect(taxonomy.statusTags.length === 6, `Expected 6 status tags, got ${taxonomy.statusTags.length}`);
  expect(methodNames.has("Clinch"), "Clinch should be a Training Method.");
  expect(!standardTagNames.has("Clinch"), "Clinch should not be a standard tag.");
  expect(standardTagNames.has("Shadowboxing"), "Shadowboxing should be a standard tag.");
  expect(!methodNames.has("Shadowboxing"), "Shadowboxing should not be a Training Method.");
  expect(standardTagNames.has("Kick Check"), "Kick Check should be active.");
  expect(standardTagNames.has("Kick Catch"), "Kick Catch should be active.");
  expect(standardTagNames.has("Feint"), "Feint should be active.");
  expect(taxonomy.standardTags.filter((tag) => tag.name.includes("Sweep")).length === 1, "Sweep should be the only sweep tag.");

  // Query builders are part of the contract because the graph/library UI will
  // depend on stable filter URLs.
  const graphPath = buildGraphApiPath(
    {
      keywords: ["uppercut"],
      methodSlugs: ["pad-work"],
      standardTagSlugs: ["uppercut"],
      customTagSlugs: ["sparring-focus"],
      statusTagSlugs: ["starred"],
      tagMode: "any",
    },
    { showTags: true, showCustomTags: true, showStatusTags: true },
  );
  expect(
    graphPath ===
      "/api/graph?keyword=uppercut&method=pad-work&tag=uppercut&tag=sparring-focus&status=starred&tagMode=any&showTags=true&showCustomTags=true&showStatusTags=true",
    `Unexpected graph query path: ${graphPath}`,
  );

  const drillsPath = buildDrillsApiPath({ keywords: ["kick"], methodSlugs: ["bag-work"], tagSlugs: ["low-kick"] });
  expect(
    drillsPath === "/api/drills?keyword=kick&method=bag-work&tag=low-kick",
    `Unexpected drills query path: ${drillsPath}`,
  );

  const allDrills = await getDrills({}, { baseUrl });
  expect(allDrills.total > 0, "Expected drills from API.");

  // Exercise the three major filter families the UI will share: method, tag,
  // and status.
  const padUppercutDrills = await getDrills(
    { methodSlugs: ["pad-work"], tagSlugs: ["uppercut"], tagMode: "any" },
    { baseUrl },
  );
  expect(padUppercutDrills.total > 0, "Expected Pad Work + Uppercut filter to return drills.");

  const starredDrills = await getDrills({ statusTagSlugs: ["starred"] }, { baseUrl });
  expect(starredDrills.total > 0, "Expected Starred status filter to return drills.");

  const firstDrill = allDrills.drills[0];
  if (!firstDrill) throw new Error("Expected at least one drill.");

  const drillDetail = await getDrill(firstDrill.id, { baseUrl });
  expect(drillDetail.steps.length > 0, "Expected drill detail to include steps.");
  expect(!JSON.stringify(drillDetail).includes("coreIdea"), "Core Idea should not appear in frontend drill data.");

  // The graph check makes sure every edge points to a node the renderer will
  // actually receive.
  const graph = await getGraph(
    { methodSlugs: ["pad-work"], tagSlugs: ["uppercut"], tagMode: "any" },
    { showTags: true },
    { baseUrl },
  );
  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  expect(graph.nodes.length > 0, "Expected graph nodes from API.");
  expect(graph.edges.length > 0, "Expected graph edges from API.");
  expect(graph.edges.every((edge) => graphNodeIds.has(edge.from) && graphNodeIds.has(edge.to)), "Graph edges should reference valid nodes.");
  expect(!JSON.stringify(graph).includes("coreIdea"), "Core Idea should not appear in frontend graph data.");

  console.log(
    `API data verification passed: ${allDrills.total} drills, ${taxonomy.standardTags.length} standard tags, ${graph.nodes.length} graph nodes.`,
  );
}

main().catch((error) => {
  if (error instanceof ApiError) {
    console.error(`${error.message} for ${error.url}`);
    console.error(error.responseBody);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
