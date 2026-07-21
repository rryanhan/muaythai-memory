import { config } from "dotenv";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getEnvironmentFilePath } from "@/config/environment-file";
import sampleDrillsJson from "../../sample-data/drills.json";
import { db, postgresClient } from "./client";
import {
  drillStatusTags,
  drillSteps,
  drillTags,
  drillTrainingMethods,
  drills,
  statusTags,
  tags,
  trainingMethods,
  users,
} from "./schema";

config({ path: getEnvironmentFilePath() });

const DEV_USER_DISPLAY_NAME = "Dev Fighter";

// The sample file still contains older exploratory fields such as coreIdea.
// passthrough lets us reuse the realistic drills while only saving active MVP
// fields into the database.
const sampleDrillSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    steps: z.array(z.string().min(1)).min(1),
    trainingMethods: z.array(z.string().min(1)).min(1),
    trainingTags: z.array(z.string().min(1)).default([]),
    customTags: z.array(z.string().min(1)).default([]),
    status: z.array(z.string().min(1)).default([]),
  })
  .passthrough();

const sampleDrillsSchema = z.array(sampleDrillSchema);

type SampleDrill = z.infer<typeof sampleDrillSchema>;

async function main() {
  const sampleDrills = sampleDrillsSchema.parse(sampleDrillsJson);
  const user = await getOrCreateDevUser();
  const methodByName = await getTrainingMethodByName();
  const standardTagByName = await getStandardTagByName();
  const statusTagByName = await getStatusTagByName();

  let seededDrillCount = 0;

  for (const sampleDrill of sampleDrills) {
    const drill = await upsertDrill(user.id, sampleDrill);
    const methodIds = sampleDrill.trainingMethods.map((methodName) => requiredLookup(methodByName, methodName, "method"));
    const standardTagIds = sampleDrill.trainingTags.map((tagName) => requiredLookup(standardTagByName, tagName, "tag"));
    const customTagIds = await Promise.all(sampleDrill.customTags.map((tagName) => getOrCreateCustomTag(user.id, tagName)));
    const statusIds = sampleDrill.status.map((statusName) => requiredLookup(statusTagByName, statusName, "status tag"));

    await Promise.all([
      upsertSteps(drill.id, sampleDrill.steps),
      addTrainingMethods(drill.id, methodIds),
      addTags(drill.id, [...standardTagIds, ...customTagIds]),
      addStatusTags(drill.id, statusIds),
    ]);

    seededDrillCount += 1;
  }

  console.log(`Dev drill seed complete: ${seededDrillCount} drills available for ${DEV_USER_DISPLAY_NAME}.`);
}

// Idempotent by display name so repeated local/dev seeds update the same user
// instead of generating throwaway accounts.
async function getOrCreateDevUser() {
  const [existingUser] = await db.select().from(users).where(eq(users.displayName, DEV_USER_DISPLAY_NAME)).limit(1);

  if (existingUser) return existingUser;

  const [user] = await db.insert(users).values({ displayName: DEV_USER_DISPLAY_NAME }).returning();
  if (!user) throw new Error("Failed to create dev user.");
  return user;
}

// There is no stable external id in the current sample JSON, so title plus dev
// user is the safest temporary upsert key.
async function upsertDrill(userId: string, sampleDrill: SampleDrill) {
  const [existingDrill] = await db
    .select()
    .from(drills)
    .where(and(eq(drills.userId, userId), eq(drills.title, sampleDrill.title)))
    .limit(1);

  if (existingDrill) {
    const [updatedDrill] = await db
      .update(drills)
      .set({
        summary: sampleDrill.summary,
        updatedAt: new Date(),
      })
      .where(eq(drills.id, existingDrill.id))
      .returning();

    if (!updatedDrill) throw new Error(`Failed to update drill: ${sampleDrill.title}`);
    return updatedDrill;
  }

  const [drill] = await db
    .insert(drills)
    .values({
      userId,
      title: sampleDrill.title,
      summary: sampleDrill.summary,
    })
    .returning();

  if (!drill) throw new Error(`Failed to create drill: ${sampleDrill.title}`);
  return drill;
}

async function upsertSteps(drillId: string, steps: string[]) {
  for (const [index, body] of steps.entries()) {
    await db
      .insert(drillSteps)
      .values({
        drillId,
        position: index + 1,
        body,
      })
      .onConflictDoUpdate({
        target: [drillSteps.drillId, drillSteps.position],
        set: {
          body,
          updatedAt: new Date(),
        },
      });
  }
}

async function addTrainingMethods(drillId: string, trainingMethodIds: string[]) {
  for (const trainingMethodId of trainingMethodIds) {
    await db.insert(drillTrainingMethods).values({ drillId, trainingMethodId }).onConflictDoNothing();
  }
}

async function addTags(drillId: string, tagIds: string[]) {
  for (const tagId of tagIds) {
    await db.insert(drillTags).values({ drillId, tagId }).onConflictDoNothing();
  }
}

async function addStatusTags(drillId: string, statusTagIds: string[]) {
  for (const statusTagId of statusTagIds) {
    await db.insert(drillStatusTags).values({ drillId, statusTagId }).onConflictDoNothing();
  }
}

async function getOrCreateCustomTag(userId: string, name: string): Promise<string> {
  const slug = slugify(name);
  const [existingTag] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.slug, slug)))
    .limit(1);

  if (existingTag) {
    await db
      .update(tags)
      .set({
        name,
        kind: "custom",
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(tags.id, existingTag.id));

    return existingTag.id;
  }

  const [customTag] = await db
    .insert(tags)
    .values({
      userId,
      name,
      slug,
      kind: "custom",
    })
    .returning();

  if (!customTag) throw new Error(`Failed to create custom tag: ${name}`);
  return customTag.id;
}

async function getTrainingMethodByName(): Promise<Map<string, string>> {
  const rows = await db.select().from(trainingMethods).where(eq(trainingMethods.active, true));
  return new Map(rows.map((method) => [method.name, method.id]));
}

async function getStandardTagByName(): Promise<Map<string, string>> {
  const rows = await db.select().from(tags).where(and(eq(tags.kind, "standard"), isNull(tags.userId), eq(tags.active, true)));
  return new Map(rows.map((tag) => [tag.name, tag.id]));
}

async function getStatusTagByName(): Promise<Map<string, string>> {
  const rows = await db.select().from(statusTags).where(eq(statusTags.active, true));
  return new Map(rows.map((status) => [status.name, status.id]));
}

function requiredLookup(map: Map<string, string>, name: string, label: string): string {
  const id = map.get(name);
  if (!id) throw new Error(`Unknown ${label}: ${name}`);
  return id;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgresClient.end();
  });
