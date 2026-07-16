import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, postgresClient } from "./client";
import {
  drillSteps,
  drillTags,
  drillTrainingMethods,
  drills,
  tags,
  trainingMethods,
  users,
} from "./schema";
import { DeleteDrillValidationError, UpdateDrillValidationError, deleteDrill, updateDrill } from "@/modules/drills/mutations";
import { getDrillById, listDrills } from "@/modules/drills/queries";
import { getMuayThaiGraph } from "@/modules/graph/queries";
import { getTaxonomy } from "@/modules/taxonomy/queries";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { getAuthErrorMessage, getMagicLinkFailureMessage } from "@/features/auth/auth-error-messages";

config({ path: ".env.local" });

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const userA = { id: randomUUID(), displayName: `Auth Verify A ${Date.now()}` };
  const userB = { id: randomUUID(), displayName: `Auth Verify B ${Date.now()}` };

  expect(safeInternalPath("/?view=library") === "/?view=library", "Valid internal redirects should be preserved.");
  expect(safeInternalPath("//example.com") === "/", "Protocol-relative redirects must be rejected.");
  expect(safeInternalPath("/\\example.com") === "/", "Backslash redirects must be rejected.");
  expect(
    getAuthErrorMessage(
      { code: "over_email_send_rate_limit", message: "raw provider error", status: 429 },
    ) === "Too many sign-in links were requested. Wait a while before trying again.",
    "Email rate limits should use recoverable product copy.",
  );
  expect(
    getMagicLinkFailureMessage("invalid-link") ===
      "That sign-in link is invalid or has expired. Request a new link and try again.",
    "Expired magic links should use recoverable product copy.",
  );

  try {
    const [method] = await db.select().from(trainingMethods).where(eq(trainingMethods.active, true)).orderBy(asc(trainingMethods.sortOrder)).limit(1);
    const [standardTag] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.kind, "standard"), isNull(tags.userId), eq(tags.active, true)))
      .orderBy(asc(tags.sortOrder))
      .limit(1);
    if (!method || !standardTag) throw new Error("Seed taxonomy is required for auth verification.");

    await db.insert(users).values([userA, userB]);
    const [customTagA, customTagB] = await db
      .insert(tags)
      .values([
        { userId: userA.id, name: "Verify A", slug: `verify-a-${userA.id}`, kind: "custom" },
        { userId: userB.id, name: "Verify B", slug: `verify-b-${userB.id}`, kind: "custom" },
      ])
      .returning();
    const [drillA, drillB] = await db
      .insert(drills)
      .values([
        { userId: userA.id, title: "Ownership A", summary: "A" },
        { userId: userB.id, title: "Ownership B", summary: "B" },
      ])
      .returning();
    if (!customTagA || !customTagB || !drillA || !drillB) throw new Error("Could not create auth fixtures.");

    await db.insert(drillSteps).values([
      { drillId: drillA.id, position: 1, body: "A step" },
      { drillId: drillB.id, position: 1, body: "B step" },
    ]);
    await db.insert(drillTrainingMethods).values([
      { drillId: drillA.id, trainingMethodId: method.id },
      { drillId: drillB.id, trainingMethodId: method.id },
    ]);
    await db.insert(drillTags).values([
      { drillId: drillA.id, tagId: standardTag.id },
      { drillId: drillA.id, tagId: customTagA.id },
      // Deliberately malformed legacy relationship: reads must still prevent
      // another user's custom taxonomy from leaking through an owned drill.
      { drillId: drillA.id, tagId: customTagB.id },
      { drillId: drillB.id, tagId: standardTag.id },
      { drillId: drillB.id, tagId: customTagB.id },
    ]);

    const [listA, listB, detailLeak, taxonomyA, taxonomyB, graphA] = await Promise.all([
      listDrills(userA.id),
      listDrills(userB.id),
      getDrillById(userA.id, drillB.id),
      getTaxonomy(userA.id),
      getTaxonomy(userB.id),
      getMuayThaiGraph(userA.id),
    ]);

    expect(listA.total === 1 && listA.drills[0]?.id === drillA.id, "User A list leaked or omitted drills.");
    expect(
      !listA.drills[0]?.customTags.some((tag) => tag.id === customTagB.id),
      "A malformed relationship leaked User B's custom tag into User A's drill.",
    );
    expect(listB.total === 1 && listB.drills[0]?.id === drillB.id, "User B list leaked or omitted drills.");
    expect(detailLeak === null, "Cross-user drill detail must return null.");
    expect(taxonomyA.customTags.some((tag) => tag.id === customTagA.id), "User A custom tag missing.");
    expect(!taxonomyA.customTags.some((tag) => tag.id === customTagB.id), "User B custom tag leaked to A.");
    expect(taxonomyB.customTags.some((tag) => tag.id === customTagB.id), "User B custom tag missing.");
    expect(graphA.nodes.some((node) => node.entityId === drillA.id), "User A graph omitted its drill.");
    expect(!graphA.nodes.some((node) => node.entityId === drillB.id), "User B drill leaked into A graph.");

    await expectUpdateNotFound(userA.id, drillB.id, method.slug, standardTag.slug);
    await expectForeignCustomTagRejected(userA.id, drillA.id, method.slug, customTagB.slug);
    await expectDeleteNotFound(userA.id, drillB.id);
    console.log("Auth ownership verification passed for drills, graph, custom tags, update, and delete.");
  } finally {
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(users).where(eq(users.id, userB.id));
  }
}

async function expectForeignCustomTagRejected(
  userId: string,
  drillId: string,
  methodSlug: string,
  foreignTagSlug: string,
) {
  try {
    await updateDrill(userId, drillId, {
      title: "Must not attach foreign tag",
      summary: "",
      notes: null,
      steps: ["No change"],
      trainingMethodSlugs: [methodSlug],
      tagSlugs: [foreignTagSlug],
      statusTagSlugs: [],
    });
    throw new Error("Cross-user custom tag assignment unexpectedly succeeded.");
  } catch (error) {
    expect(
      error instanceof UpdateDrillValidationError && error.status === 400,
      "Cross-user custom tag assignment must be rejected.",
    );
  }
}

async function expectUpdateNotFound(userId: string, drillId: string, methodSlug: string, tagSlug: string) {
  try {
    await updateDrill(userId, drillId, {
      title: "Must not update",
      summary: "",
      notes: null,
      steps: ["No change"],
      trainingMethodSlugs: [methodSlug],
      tagSlugs: [tagSlug],
      statusTagSlugs: [],
    });
    throw new Error("Cross-user update unexpectedly succeeded.");
  } catch (error) {
    expect(error instanceof UpdateDrillValidationError && error.status === 404, "Cross-user update must return 404.");
  }
}

async function expectDeleteNotFound(userId: string, drillId: string) {
  try {
    await deleteDrill(userId, drillId);
    throw new Error("Cross-user delete unexpectedly succeeded.");
  } catch (error) {
    expect(error instanceof DeleteDrillValidationError, "Cross-user delete must return 404.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgresClient.end();
  });
