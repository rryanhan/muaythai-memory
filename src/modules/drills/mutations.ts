import { and, eq, inArray, isNull, or } from "drizzle-orm";
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
  users,
} from "@/db/schema";
import {
  createDrillInputSchema,
  updateDrillInputSchema,
  type CreateDrillInput,
  type DrillDetail,
  type UpdateSavedListInput,
  type UpdateSavedListResponse,
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

export class CreateDrillIdempotencyError extends Error {
  readonly status = 409;

  constructor() {
    super("This Idempotency-Key was already used for a different drill.");
    this.name = "CreateDrillIdempotencyError";
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

export class DeleteDrillValidationError extends Error {
  readonly status = 404;

  constructor() {
    super("Drill not found.");
    this.name = "DeleteDrillValidationError";
  }
}

export class SavedListMutationError extends Error {
  readonly status: 400 | 404;

  constructor(message: string, status: 400 | 404) {
    super(message);
    this.name = "SavedListMutationError";
    this.status = status;
  }
}

export async function createDrill(
  userId: string,
  rawInput: CreateDrillInput,
  options: { completeFirstDrillGuide?: boolean; creationKey?: string } = {},
): Promise<DrillDetail> {
  const input = createDrillInputSchema.parse(rawInput);
  if (options.creationKey) {
    const existingDrill = await getDrillByCreationKey(userId, options.creationKey);
    if (existingDrill) {
      assertIdempotentDrillInput(existingDrill, input);
      return existingDrill;
    }
  }

  const trainingMethodSlugs = unique(input.trainingMethodSlugs);
  const tagSlugs = unique(input.tagSlugs);
  const statusSlugs = unique(input.statusTagSlugs);
  const [methodRows, tagRows, statusRows] = await Promise.all([
    getActiveTrainingMethodsBySlug(trainingMethodSlugs),
    getActiveTagsBySlug(userId, tagSlugs),
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

  const createdDrillId = await db.transaction(async (tx) => {
    const insert = tx
      .insert(drills)
      .values({
        userId,
        title: input.title,
        summary: input.summary ?? "",
        notes: input.notes,
        creationKey: options.creationKey,
      });
    const [drill] = options.creationKey
      ? await insert
          .onConflictDoNothing({ target: [drills.userId, drills.creationKey] })
          .returning({ id: drills.id })
      : await insert.returning({ id: drills.id });

    if (!drill && options.creationKey) {
      const [existing] = await tx
        .select({ id: drills.id })
        .from(drills)
        .where(and(eq(drills.userId, userId), eq(drills.creationKey, options.creationKey)))
        .limit(1);
      if (existing) return existing.id;
    }

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

    if (options.completeFirstDrillGuide) {
      const [completedUser] = await tx
        .update(users)
        .set({
          firstDrillGuideCompletedAt: new Date(),
          firstDrillGuideSkippedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      if (!completedUser) throw new Error("Profile could not be found.");
    }

    return drill.id;
  });

  const drillDetail = await getDrillById(userId, createdDrillId);
  if (!drillDetail) throw new Error("Created drill could not be loaded.");
  if (options.creationKey) assertIdempotentDrillInput(drillDetail, input);
  return drillDetail;
}

export async function updateDrill(userId: string, id: string, rawInput: UpdateDrillInput): Promise<DrillDetail> {
  const input = updateDrillInputSchema.parse(rawInput);
  const trainingMethodSlugs = unique(input.trainingMethodSlugs);
  const tagSlugs = unique(input.tagSlugs);
  const statusSlugs = unique(input.statusTagSlugs);
  const [methodRows, tagRows, statusRows] = await Promise.all([
    getActiveTrainingMethodsBySlug(trainingMethodSlugs),
    getActiveTagsBySlug(userId, tagSlugs),
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

  await db.transaction(async (tx) => {
    const [updatedDrill] = await tx
      .update(drills)
      .set({
        title: input.title,
        summary: input.summary ?? "",
        notes: input.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(drills.id, id), eq(drills.userId, userId)))
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

  const drillDetail = await getDrillById(userId, id);
  if (!drillDetail) throw new UpdateDrillValidationError(["Updated drill could not be loaded."], 404);
  return drillDetail;
}

/** Permanently removes one owned drill; database cascades clean up its relationships. */
export async function deleteDrill(userId: string, id: string): Promise<string> {
  const [deletedDrill] = await db
    .delete(drills)
    .where(and(eq(drills.id, id), eq(drills.userId, userId)))
    .returning({ id: drills.id });

  if (!deletedDrill) throw new DeleteDrillValidationError();
  return deletedDrill.id;
}

/** Applies one Saved List relationship without replacing the drill's other list state. */
export async function setDrillSavedList(
  userId: string,
  drillId: string,
  input: UpdateSavedListInput,
): Promise<UpdateSavedListResponse> {
  return db.transaction(async (tx) => {
    const [ownedDrill] = await tx
      .select({ id: drills.id })
      .from(drills)
      .where(and(eq(drills.id, drillId), eq(drills.userId, userId)))
      .limit(1);

    if (!ownedDrill) {
      throw new SavedListMutationError("Drill not found.", 404);
    }

    const [status] = await tx
      .select({
        id: statusTags.id,
        name: statusTags.name,
        slug: statusTags.slug,
        sortOrder: statusTags.sortOrder,
      })
      .from(statusTags)
      .where(and(eq(statusTags.slug, input.slug), eq(statusTags.active, true)))
      .limit(1);

    if (!status) {
      throw new SavedListMutationError("Saved List is not active.", 400);
    }

    if (input.selected) {
      await tx
        .insert(drillStatusTags)
        .values({ drillId, statusTagId: status.id })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(drillStatusTags)
        .where(and(eq(drillStatusTags.drillId, drillId), eq(drillStatusTags.statusTagId, status.id)));
    }

    return { drillId, status, selected: input.selected };
  });
}

async function getActiveTrainingMethodsBySlug(slugs: string[]) {
  return db
    .select({ id: trainingMethods.id, slug: trainingMethods.slug })
    .from(trainingMethods)
    .where(and(inArray(trainingMethods.slug, slugs), eq(trainingMethods.active, true)));
}

async function getActiveTagsBySlug(userId: string, slugs: string[]) {
  if (slugs.length === 0) return [];

  return db
    .select({ id: tags.id, slug: tags.slug })
    .from(tags)
    .where(
      and(
        inArray(tags.slug, slugs),
        eq(tags.active, true),
        or(isNull(tags.userId), eq(tags.userId, userId)),
      ),
    );
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

async function getDrillByCreationKey(userId: string, creationKey: string): Promise<DrillDetail | null> {
  const [existing] = await db
    .select({ id: drills.id })
    .from(drills)
    .where(and(eq(drills.userId, userId), eq(drills.creationKey, creationKey)))
    .limit(1);
  return existing ? getDrillById(userId, existing.id) : null;
}

function assertIdempotentDrillInput(drill: DrillDetail, input: ReturnType<typeof createDrillInputSchema.parse>) {
  const existing = {
    title: drill.title,
    summary: drill.summary,
    notes: drill.notes,
    steps: drill.steps.map((step) => step.body),
    trainingMethodSlugs: sortedUnique(drill.trainingMethods.map((method) => method.slug)),
    tagSlugs: sortedUnique([...drill.tags, ...drill.customTags].map((tag) => tag.slug)),
    statusTagSlugs: sortedUnique(drill.statusTags.map((status) => status.slug)),
  };
  const requested = {
    title: input.title,
    summary: input.summary,
    notes: input.notes,
    steps: input.steps,
    trainingMethodSlugs: sortedUnique(input.trainingMethodSlugs),
    tagSlugs: sortedUnique(input.tagSlugs),
    statusTagSlugs: sortedUnique(input.statusTagSlugs),
  };

  if (JSON.stringify(existing) !== JSON.stringify(requested)) {
    throw new CreateDrillIdempotencyError();
  }
}

function sortedUnique(values: string[]): string[] {
  return unique(values).sort();
}
