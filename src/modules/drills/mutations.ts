import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  drillStatusTags,
  drillSteps,
  drillTags,
  drillTrainingMethods,
  drills,
  statusTags,
  tags,
  trainingMethods,
} from "@/db/schema";
import { getCurrentUserForWrite } from "@/modules/users";
import {
  createDrillInputSchema,
  updateDrillInputSchema,
  type CreateDrillInput,
  type DrillDetail,
  type UpdateDrillInput,
} from "./contracts";
import { getDrillById } from "./queries";

export class CreateDrillValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super("Drill could not be created.");
    this.name = "CreateDrillValidationError";
    this.issues = issues;
  }
}

export class UpdateDrillValidationError extends Error {
  readonly issues: string[];
  readonly status: 400 | 404;

  constructor(issues: string[], status: 400 | 404 = 400) {
    super("Drill could not be updated.");
    this.name = "UpdateDrillValidationError";
    this.issues = issues;
    this.status = status;
  }
}

export async function createDrill(rawInput: CreateDrillInput): Promise<DrillDetail> {
  const input = createDrillInputSchema.parse(rawInput);
  const trainingMethodSlugs = unique(input.trainingMethodSlugs);
  const tagSlugs = unique(input.tagSlugs);
  const statusSlugs = unique(input.statusTagSlugs);
  const [methodRows, tagRows, statusRows] = await Promise.all([
    getActiveTrainingMethodsBySlug(trainingMethodSlugs),
    getActiveTagsBySlug(tagSlugs),
    getActiveStatusTagsBySlug(statusSlugs),
  ]);
  const issues = [
    ...getMissingSlugIssues("Training Method", trainingMethodSlugs, methodRows.map((method) => method.slug)),
    ...getMissingSlugIssues("Tag", tagSlugs, tagRows.map((tag) => tag.slug)),
    ...getMissingSlugIssues("Status", statusSlugs, statusRows.map((status) => status.slug)),
  ];

  if (issues.length > 0) {
    throw new CreateDrillValidationError(issues);
  }

  const user = await getCurrentUserForWrite();

  const createdDrillId = await db.transaction(async (tx) => {
    const [drill] = await tx
      .insert(drills)
      .values({
        userId: user.id,
        title: input.title,
        summary: input.summary ?? "",
        notes: input.notes,
      })
      .returning({ id: drills.id });

    if (!drill) throw new Error("Failed to create drill.");

    await tx.insert(drillSteps).values(
      input.steps.map((body, index) => ({
        drillId: drill.id,
        position: index + 1,
        body,
      })),
    );

    await tx.insert(drillTrainingMethods).values(
      methodRows.map((method) => ({
        drillId: drill.id,
        trainingMethodId: method.id,
      })),
    );

    if (tagRows.length > 0) {
      await tx.insert(drillTags).values(
        tagRows.map((tag) => ({
          drillId: drill.id,
          tagId: tag.id,
        })),
      );
    }

    if (statusRows.length > 0) {
      await tx.insert(drillStatusTags).values(
        statusRows.map((status) => ({
          drillId: drill.id,
          statusTagId: status.id,
        })),
      );
    }

    return drill.id;
  });

  const drillDetail = await getDrillById(createdDrillId);
  if (!drillDetail) throw new Error("Created drill could not be loaded.");
  return drillDetail;
}

export async function updateDrill(id: string, rawInput: UpdateDrillInput): Promise<DrillDetail> {
  const input = updateDrillInputSchema.parse(rawInput);
  const trainingMethodSlugs = unique(input.trainingMethodSlugs);
  const tagSlugs = unique(input.tagSlugs);
  const statusSlugs = unique(input.statusTagSlugs);
  const [methodRows, tagRows, statusRows] = await Promise.all([
    getActiveTrainingMethodsBySlug(trainingMethodSlugs),
    getActiveTagsBySlug(tagSlugs),
    getActiveStatusTagsBySlug(statusSlugs),
  ]);
  const issues = [
    ...getMissingSlugIssues("Training Method", trainingMethodSlugs, methodRows.map((method) => method.slug)),
    ...getMissingSlugIssues("Tag", tagSlugs, tagRows.map((tag) => tag.slug)),
    ...getMissingSlugIssues("Status", statusSlugs, statusRows.map((status) => status.slug)),
  ];

  if (issues.length > 0) {
    throw new UpdateDrillValidationError(issues);
  }

  const user = await getCurrentUserForWrite();

  await db.transaction(async (tx) => {
    const [updatedDrill] = await tx
      .update(drills)
      .set({
        title: input.title,
        summary: input.summary ?? "",
        notes: input.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(drills.id, id), eq(drills.userId, user.id)))
      .returning({ id: drills.id });

    if (!updatedDrill) {
      throw new UpdateDrillValidationError(["Drill not found."], 404);
    }

    await tx.delete(drillSteps).where(eq(drillSteps.drillId, id));
    await tx.delete(drillTrainingMethods).where(eq(drillTrainingMethods.drillId, id));
    await tx.delete(drillTags).where(eq(drillTags.drillId, id));
    await tx.delete(drillStatusTags).where(eq(drillStatusTags.drillId, id));

    await tx.insert(drillSteps).values(
      input.steps.map((body, index) => ({
        drillId: id,
        position: index + 1,
        body,
      })),
    );

    await tx.insert(drillTrainingMethods).values(
      methodRows.map((method) => ({
        drillId: id,
        trainingMethodId: method.id,
      })),
    );

    if (tagRows.length > 0) {
      await tx.insert(drillTags).values(
        tagRows.map((tag) => ({
          drillId: id,
          tagId: tag.id,
        })),
      );
    }

    if (statusRows.length > 0) {
      await tx.insert(drillStatusTags).values(
        statusRows.map((status) => ({
          drillId: id,
          statusTagId: status.id,
        })),
      );
    }
  });

  const drillDetail = await getDrillById(id);
  if (!drillDetail) throw new UpdateDrillValidationError(["Updated drill could not be loaded."], 404);
  return drillDetail;
}

async function getActiveTrainingMethodsBySlug(slugs: string[]) {
  return db
    .select({ id: trainingMethods.id, slug: trainingMethods.slug })
    .from(trainingMethods)
    .where(and(inArray(trainingMethods.slug, slugs), eq(trainingMethods.active, true)));
}

async function getActiveTagsBySlug(slugs: string[]) {
  if (slugs.length === 0) return [];

  return db
    .select({ id: tags.id, slug: tags.slug })
    .from(tags)
    .where(and(inArray(tags.slug, slugs), eq(tags.active, true)));
}

async function getActiveStatusTagsBySlug(slugs: string[]) {
  if (slugs.length === 0) return [];

  return db
    .select({ id: statusTags.id, slug: statusTags.slug })
    .from(statusTags)
    .where(and(inArray(statusTags.slug, slugs), eq(statusTags.active, true)));
}

function getMissingSlugIssues(label: string, requestedSlugs: string[], foundSlugs: string[]): string[] {
  const found = new Set(foundSlugs);
  return requestedSlugs.filter((slug) => !found.has(slug)).map((slug) => `${label} not found: ${slug}`);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
