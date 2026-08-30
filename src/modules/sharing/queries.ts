import {
  and,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  lt,
  notExists,
  or,
  sql,
  type SQLWrapper,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  drillShares,
  drills,
  follows,
  userBlocks,
  users,
} from "@/db/schema";
import {
  getDrillById,
  getDrillSummariesByIds,
} from "@/modules/drills/queries";
import {
  findFighterByUsername,
  getReciprocalConnectionPage,
} from "@/modules/connections/queries";
import type {
  DrillShareRecipientPage,
  SharedDrillDetailResponse,
  SharedDrillListResponse,
} from "./contracts";
import { DrillShareError } from "./errors";

const sharedCursorSchema = z.object({
  sharedAt: z.string().datetime(),
  drillId: z.string().uuid(),
});

type SharedCursor = z.infer<typeof sharedCursorSchema>;

export async function getDrillShareRecipientPage(
  ownerUserId: string,
  drillId: string,
  cursor: string | null,
): Promise<DrillShareRecipientPage> {
  const [ownedDrill] = await db
    .select({ id: drills.id })
    .from(drills)
    .where(and(eq(drills.id, drillId), eq(drills.userId, ownerUserId)))
    .limit(1);
  if (!ownedDrill) throw new DrillShareError("Drill not found.", 404);

  const page = await getReciprocalConnectionPage(ownerUserId, cursor, 20);
  const recipientIds = page.items.map((item) => item.profile.id);
  const sharedRows = recipientIds.length > 0
    ? await db
        .select({ recipientUserId: drillShares.recipientUserId })
        .from(drillShares)
        .where(and(
          eq(drillShares.drillId, drillId),
          inArray(drillShares.recipientUserId, recipientIds),
        ))
    : [];
  const sharedIds = new Set(sharedRows.map((row) => row.recipientUserId));

  return {
    items: page.items.map((item) => ({
      profile: item.profile,
      shared: sharedIds.has(item.profile.id),
    })),
    nextCursor: page.nextCursor,
  };
}

export async function listSharedDrills(
  viewerUserId: string,
  rawCursor: string | null,
  ownerUsername?: string,
): Promise<SharedDrillListResponse> {
  const cursor = decodeSharedCursor(rawCursor);
  let ownerUserId: string | null = null;
  if (ownerUsername) {
    const owner = await findFighterByUsername(viewerUserId, ownerUsername);
    if (!owner || !owner.mutual) {
      throw new DrillShareError("Fighter not found.", 404);
    }
    ownerUserId = owner.profile.id;
  }

  const relationshipExists = reciprocalFollowCondition(viewerUserId, drills.userId);
  const pairIsUnblocked = notExists(
    db
      .select({ value: sql`1` })
      .from(userBlocks)
      .where(or(
        and(
          eq(userBlocks.blockerId, viewerUserId),
          eq(userBlocks.blockedId, drills.userId),
        ),
        and(
          eq(userBlocks.blockerId, drills.userId),
          eq(userBlocks.blockedId, viewerUserId),
        ),
      )),
  );
  const rows = await db
    .select({
      drillId: drills.id,
      ownerId: users.id,
      ownerUsername: sql<string>`${users.username}`,
      ownerAvatarUrl: users.avatarUrl,
      sharedAt: drillShares.createdAt,
    })
    .from(drillShares)
    .innerJoin(drills, eq(drills.id, drillShares.drillId))
    .innerJoin(users, eq(users.id, drills.userId))
    .where(and(
      eq(drillShares.recipientUserId, viewerUserId),
      ownerUserId ? eq(drills.userId, ownerUserId) : undefined,
      isNotNull(users.username),
      isNotNull(users.profileOnboardedAt),
      relationshipExists,
      pairIsUnblocked,
      cursor
        ? or(
            lt(drillShares.createdAt, new Date(cursor.sharedAt)),
            and(
              eq(drillShares.createdAt, new Date(cursor.sharedAt)),
              lt(drillShares.drillId, cursor.drillId),
            ),
          )
        : undefined,
    ))
    .orderBy(desc(drillShares.createdAt), desc(drillShares.drillId))
    .limit(11);
  const hasMore = rows.length > 10;
  const pageRows = hasMore ? rows.slice(0, 10) : rows;
  const summaries = await getSummariesByOwner(pageRows);
  const last = pageRows.at(-1);

  return {
    items: pageRows.flatMap((row) => {
      const drill = summaries.get(row.drillId);
      if (!drill) return [];
      return [{
        drill: { ...drill, statusTags: [] },
        owner: {
          id: row.ownerId,
          username: row.ownerUsername,
          avatarUrl: row.ownerAvatarUrl,
        },
        sharedAt: row.sharedAt,
      }];
    }),
    nextCursor: hasMore && last
      ? encodeSharedCursor({
          sharedAt: last.sharedAt.toISOString(),
          drillId: last.drillId,
        })
      : null,
  };
}

export async function getSharedDrillById(
  viewerUserId: string,
  drillId: string,
): Promise<SharedDrillDetailResponse | null> {
  const access = await loadSharedAccess(viewerUserId, drillId);
  if (!access) return null;
  const drill = await getDrillById(access.ownerId, drillId);
  if (!drill) return null;

  // Recheck after loading the detail so a concurrent removal/block cannot
  // return content after its share was revoked.
  const confirmedAccess = await loadSharedAccess(viewerUserId, drillId);
  if (!confirmedAccess) return null;

  return {
    drill: { ...drill, statusTags: [] },
    owner: {
      id: confirmedAccess.ownerId,
      username: confirmedAccess.ownerUsername,
      avatarUrl: confirmedAccess.ownerAvatarUrl,
    },
    sharedAt: confirmedAccess.sharedAt,
  };
}

async function loadSharedAccess(viewerUserId: string, drillId: string) {
  const rows = await db
    .select({
      ownerId: users.id,
      ownerUsername: sql<string>`${users.username}`,
      ownerAvatarUrl: users.avatarUrl,
      sharedAt: drillShares.createdAt,
    })
    .from(drillShares)
    .innerJoin(drills, eq(drills.id, drillShares.drillId))
    .innerJoin(users, eq(users.id, drills.userId))
    .where(and(
      eq(drillShares.drillId, drillId),
      eq(drillShares.recipientUserId, viewerUserId),
      isNotNull(users.username),
      reciprocalFollowCondition(viewerUserId, drills.userId),
      notExists(
        db
          .select({ value: sql`1` })
          .from(userBlocks)
          .where(or(
            and(
              eq(userBlocks.blockerId, viewerUserId),
              eq(userBlocks.blockedId, drills.userId),
            ),
            and(
              eq(userBlocks.blockerId, drills.userId),
              eq(userBlocks.blockedId, viewerUserId),
            ),
          )),
      ),
    ))
    .limit(1);
  return rows[0] ?? null;
}

function reciprocalFollowCondition(
  viewerUserId: string,
  ownerUserId: SQLWrapper,
) {
  return and(
    exists(
      db
        .select({ value: sql`1` })
        .from(follows)
        .where(and(
          eq(follows.followerId, viewerUserId),
          eq(follows.followingId, ownerUserId),
          eq(follows.status, "accepted"),
        )),
    ),
    exists(
      db
        .select({ value: sql`1` })
        .from(follows)
        .where(and(
          eq(follows.followerId, ownerUserId),
          eq(follows.followingId, viewerUserId),
          eq(follows.status, "accepted"),
        )),
    ),
  );
}

async function getSummariesByOwner(
  rows: Array<{ drillId: string; ownerId: string }>,
) {
  const ownerIds = [...new Set(rows.map((row) => row.ownerId))];
  const summaries = await Promise.all(
    ownerIds.map(async (ownerId) => [
      ownerId,
      await getDrillSummariesByIds(
        ownerId,
        rows.filter((row) => row.ownerId === ownerId).map((row) => row.drillId),
      ),
    ] as const),
  );

  return new Map(
    summaries.flatMap(([, drillsForOwner]) => (
      drillsForOwner.map((drill) => [drill.id, drill] as const)
    )),
  );
}

function encodeSharedCursor(cursor: SharedCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeSharedCursor(rawCursor: string | null): SharedCursor | null {
  if (!rawCursor) return null;
  try {
    return sharedCursorSchema.parse(
      JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8")),
    );
  } catch {
    z.string().refine(() => false, "Invalid shared-drill cursor.").parse(rawCursor);
    return null;
  }
}
