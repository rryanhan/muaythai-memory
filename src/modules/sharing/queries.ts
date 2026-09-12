import {
  and,
  desc,
  eq,
  exists,
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
  getDrillSummariesByOwnerPairs,
} from "@/modules/drills/queries";
import {
  findFighterByUsername,
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

const recipientCursorSchema = z.object({
  username: z.string().min(1).max(30),
  userId: z.string().uuid(),
});

type RecipientCursor = z.infer<typeof recipientCursorSchema>;
type DrillShareRecipientQueryRow = {
  ownedDrillId: string;
  recipientId: string | null;
  recipientUsername: string | null;
  recipientAvatarUrl: string | null;
  occurredAt: Date | string | null;
  shared: boolean | null;
};

export async function getDrillShareRecipientPage(
  ownerUserId: string,
  drillId: string,
  cursor: string | null,
): Promise<DrillShareRecipientPage> {
  const decodedCursor = decodeRecipientCursor(cursor);
  const rows = await db.execute<DrillShareRecipientQueryRow>(sql`
    with owned_drill as materialized (
      select ${drills.id} as "id"
      from ${drills}
      where ${drills.id} = ${drillId}
        and ${drills.userId} = ${ownerUserId}
      limit 1
    )
    select
      owned_drill."id" as "ownedDrillId",
      recipient."id" as "recipientId",
      recipient."username" as "recipientUsername",
      recipient."avatarUrl" as "recipientAvatarUrl",
      recipient."occurredAt" as "occurredAt",
      recipient."shared" as "shared"
    from owned_drill
    left join lateral (
      select
        ${users.id} as "id",
        ${users.username} as "username",
        ${users.avatarUrl} as "avatarUrl",
        coalesce(${follows.respondedAt}, ${follows.updatedAt}) as "occurredAt",
        exists (
          select 1
          from ${drillShares}
          where ${drillShares.drillId} = owned_drill."id"
            and ${drillShares.recipientUserId} = ${users.id}
        ) as "shared"
      from ${follows}
      inner join ${users} on ${users.id} = ${follows.followingId}
      where ${follows.followerId} = ${ownerUserId}
        and ${follows.status} = 'accepted'
        and ${users.username} is not null
        and ${users.profileOnboardedAt} is not null
        and exists (
          select 1
          from ${follows} as reverse_follow
          where reverse_follow."follower_id" = ${users.id}
            and reverse_follow."following_id" = ${ownerUserId}
            and reverse_follow."status" = 'accepted'
        )
        and not exists (
          select 1
          from ${userBlocks}
          where (
            ${userBlocks.blockerId} = ${ownerUserId}
            and ${userBlocks.blockedId} = ${users.id}
          ) or (
            ${userBlocks.blockerId} = ${users.id}
            and ${userBlocks.blockedId} = ${ownerUserId}
          )
        )
        and ${decodedCursor.error
          ? sql`false`
          : recipientCursorCondition(decodedCursor.cursor)}
      order by ${users.username}, ${users.id}
      limit 21
    ) as recipient on true
    order by recipient."username", recipient."id"
  `);
  if (!rows[0]) throw new DrillShareError("Drill not found.", 404);
  if (decodedCursor.error) throw decodedCursor.error;

  const recipientRows = rows.flatMap((row) => {
    if (!row.recipientId) return [];
    if (!row.recipientUsername || !row.occurredAt || row.shared === null) {
      throw new Error("Drill share recipient query returned an incomplete profile.");
    }
    return [{
      id: row.recipientId,
      username: row.recipientUsername,
      avatarUrl: row.recipientAvatarUrl,
      occurredAt: row.occurredAt instanceof Date ? row.occurredAt : new Date(row.occurredAt),
      shared: row.shared,
    }];
  });
  const hasMore = recipientRows.length > 20;
  const pageRows = hasMore ? recipientRows.slice(0, 20) : recipientRows;
  const last = pageRows.at(-1);

  return {
    items: pageRows.map((row) => ({
      profile: {
        id: row.id,
        username: row.username,
        avatarUrl: row.avatarUrl,
      },
      shared: row.shared,
    })),
    nextCursor: hasMore && last
      ? encodeRecipientCursor({ username: last.username, userId: last.id })
      : null,
  };
}

function decodeRecipientCursor(rawCursor: string | null): {
  cursor: RecipientCursor | null;
  error: z.ZodError | null;
} {
  if (!rawCursor) return { cursor: null, error: null };
  try {
    return {
      cursor: recipientCursorSchema.parse(
        JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8")),
      ),
      error: null,
    };
  } catch {
    return {
      cursor: null,
      error: new z.ZodError([{
        code: "custom",
        path: ["cursor"],
        message: "Invalid connections cursor.",
        input: rawCursor,
      }]),
    };
  }
}

function recipientCursorCondition(cursor: RecipientCursor | null) {
  if (!cursor) return sql`true`;
  return sql`(
    ${users.username} > ${cursor.username}
    or (${users.username} = ${cursor.username} and ${users.id} > ${cursor.userId})
  )`;
}

function encodeRecipientCursor(cursor: RecipientCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
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
  const summaries = await getDrillSummariesByOwnerPairs(rows, {
    includeStatusTags: false,
  });

  return new Map(
    summaries.map((drill) => [drill.id, drill] as const),
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
