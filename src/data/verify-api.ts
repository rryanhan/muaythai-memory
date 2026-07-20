import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  ApiError,
  buildDrillsApiPath,
  buildGraphApiPath,
  getDrill,
  getDrills,
  getGraph,
  getTaxonomy,
  updateDrillSavedList,
} from "./api";
import type { ApiClientOptions } from "./types";

config({ path: ".env.local" });

// Verifies the frontend data layer against a running local Next server. This
// catches query-string mistakes, backend response drift, and parked fields like
// coreIdea accidentally returning to active payloads.
const baseUrl = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const clientOptions: ApiClientOptions = {
    baseUrl,
    headers: await getAuthenticatedHeaders(),
  };
  const taxonomy = await getTaxonomy(clientOptions);
  const standardTagNames = new Set(taxonomy.standardTags.map((tag) => tag.name));
  const methodNames = new Set(taxonomy.trainingMethods.map((method) => method.name));
  const statusBySlug = new Map(taxonomy.statusTags.map((status) => [status.slug, status.name]));

  expect(taxonomy.trainingMethods.length === 5, `Expected 5 training methods, got ${taxonomy.trainingMethods.length}`);
  expect(taxonomy.standardTags.length === 28, `Expected 28 standard tags, got ${taxonomy.standardTags.length}`);
  expect(taxonomy.statusTags.length === 2, `Expected 2 Saved Lists, got ${taxonomy.statusTags.length}`);
  expect(statusBySlug.get("starred") === "Favourite", "Favourite should retain the starred backend slug.");
  expect(statusBySlug.get("drill-back-in") === "Drill Back In", "Drill Back In should remain active.");
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

  const allDrills = await getDrills({}, clientOptions);
  expect(allDrills.total > 0, "Expected drills from API.");

  // Exercise the three major filter families the UI will share: method, tag,
  // and status.
  const padUppercutDrills = await getDrills(
    { methodSlugs: ["pad-work"], tagSlugs: ["uppercut"], tagMode: "any" },
    clientOptions,
  );
  expect(padUppercutDrills.total > 0, "Expected Pad Work + Uppercut filter to return drills.");

  const starredDrills = await getDrills({ statusTagSlugs: ["starred"] }, clientOptions);
  expect(starredDrills.total > 0, "Expected Favourite filter to return drills.");

  const firstDrill = allDrills.drills[0];
  if (!firstDrill) throw new Error("Expected at least one drill.");

  const drillDetail = await getDrill(firstDrill.id, clientOptions);
  expect(drillDetail.steps.length > 0, "Expected drill detail to include steps.");
  expect(!JSON.stringify(drillDetail).includes("coreIdea"), "Core Idea should not appear in frontend drill data.");

  await verifySavedListEndpoint(firstDrill.id, drillDetail.statusTags.map((status) => status.slug), clientOptions);

  // The graph check makes sure every edge points to a node the renderer will
  // actually receive.
  const graph = await getGraph(
    { methodSlugs: ["pad-work"], tagSlugs: ["uppercut"], tagMode: "any" },
    { showTags: true },
    clientOptions,
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

async function verifySavedListEndpoint(
  drillId: string,
  initialStatusSlugs: string[],
  clientOptions: ApiClientOptions,
) {
  const initialFavourite = initialStatusSlugs.includes("starred");
  const initialDrillBackIn = initialStatusSlugs.includes("drill-back-in");
  const nextFavourite = !initialFavourite;
  const nextDrillBackIn = !initialDrillBackIn;

  try {
    await Promise.all([
      updateDrillSavedList(drillId, { slug: "starred", selected: nextFavourite }, clientOptions),
      updateDrillSavedList(drillId, { slug: "drill-back-in", selected: nextDrillBackIn }, clientOptions),
    ]);
    await Promise.all([
      updateDrillSavedList(drillId, { slug: "starred", selected: nextFavourite }, clientOptions),
      updateDrillSavedList(drillId, { slug: "drill-back-in", selected: nextDrillBackIn }, clientOptions),
    ]);

    const updatedDrill = await getDrill(drillId, clientOptions);
    const updatedSlugs = new Set(updatedDrill.statusTags.map((status) => status.slug));
    expect(updatedSlugs.has("starred") === nextFavourite, "Favourite quick action should be idempotent.");
    expect(updatedSlugs.has("drill-back-in") === nextDrillBackIn, "Drill Back In quick action should be independent.");

    const retiredResponse = await fetch(
      new URL(`/api/drills/${drillId}/saved-lists`, baseUrl),
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...clientOptions.headers },
        body: JSON.stringify({ slug: "archived", selected: true }),
      },
    );
    expect(retiredResponse.status === 400, "Retired Saved List slugs should return 400.");

    const malformedResponse = await fetch(
      new URL(`/api/drills/${drillId}/saved-lists`, baseUrl),
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...clientOptions.headers },
        body: "{",
      },
    );
    expect(malformedResponse.status === 400, "Malformed Saved List requests should return 400.");
  } finally {
    await Promise.all([
      updateDrillSavedList(drillId, { slug: "starred", selected: initialFavourite }, clientOptions),
      updateDrillSavedList(drillId, { slug: "drill-back-in", selected: initialDrillBackIn }, clientOptions),
    ]);
  }
}

async function getAuthenticatedHeaders(): Promise<HeadersInit> {
  const configuredCookie = process.env.API_VERIFY_COOKIE?.trim();
  if (configuredCookie) return { cookie: configuredCookie };

  const email = process.env.API_VERIFY_EMAIL?.trim().toLowerCase();
  if (!email) {
    throw new Error("Set API_VERIFY_EMAIL or API_VERIFY_COOKIE to verify protected API responses.");
  }

  const supabaseUrl = requireEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? requireEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const adminClient = createClient(supabaseUrl, requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !linkData.properties.hashed_token) {
    throw new Error(`Could not create an API verification session${linkError ? `: ${linkError.message}` : "."}`);
  }

  const { data: verificationData, error: verificationError } = await authClient.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (verificationError || !verificationData.session) {
    throw new Error(
      `Could not verify the API session${verificationError ? `: ${verificationError.message}` : "."}`,
    );
  }

  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  if (!projectRef) throw new Error("Could not derive the Supabase project reference.");

  return { cookie: encodeSessionCookie(`sb-${projectRef}-auth-token`, verificationData.session) };
}

function encodeSessionCookie(name: string, session: object): string {
  const encodedValue = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  const chunks = encodedValue.match(/.{1,3180}/g) ?? [];

  if (chunks.length <= 1) return `${name}=${encodedValue}`;
  return chunks.map((chunk, index) => `${name}.${index}=${chunk}`).join("; ");
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for authenticated API verification.`);
  return value;
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
