import {
  and,
  asc,
  count,
  countDistinct,
  eq,
  gt,
  isNotNull,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  drillTrainingMethods,
  drills,
  friendships,
  trainingMethods,
  userBlocks,
  users,
} from "@/db/schema";
import type {
  FighterConnection,
  FighterProfile,
  FighterSummary,
  FriendCounts,
  FriendSection,
  FriendSectionPageResponse,
  FriendshipState,
} from "./contracts";
import { canonicalFriendPair } from "./pair";

type FriendProfileRow = {
  id: string;
  username: string | null;
  avatarUrl: string | null;
};

type RelationshipRow = typeof friendships.$inferSelect;

const sectionCursorSchema = z.object({
  username: z.string().min(1).max(30),
  userId: z.string().uuid(),
});

export async function getFriendsSummary(
  currentUserId: string,
): Promise<{ counts: FriendCounts }> {
  const membership = or(
    eq(friendships.userOneId, currentUserId),
    eq(friendships.userTwoId, currentUserId),
  );
  const [friendRows, incomingRows, outgoingRows, blockedRows] = await Promise.all([
    db
      .select({ count: count() })
      .from(friendships)
      .where(and(membership, eq(friendships.status, "accepted"))),
    db
      .select({ count: count() })
      .from(friendships)
      .where(and(
        membership,
        eq(friendships.status, "pending"),
        ne(friendships.requestedById, currentUserId),
      )),
    db
      .select({ count: count() })
      .from(friendships)
      .where(and(
        membership,
        eq(friendships.status, "pending"),
        eq(friendships.requestedById, currentUserId),
      )),
    db
      .select({ count: count() })
      .from(userBlocks)
      .where(eq(userBlocks.blockerId, currentUserId)),
  ]);

  return {
    counts: {
      friends: friendRows[0]?.count ?? 0,
      incoming: incomingRows[0]?.count ?? 0,
      outgoing: outgoingRows[0]?.count ?? 0,
      blocked: blockedRows[0]?.count ?? 0,
    },
  };
}

export async function getFriendSectionPage(
  currentUserId: string,
  section: FriendSection,
  rawCursor: string | null,
  rawLimit = 20,
): Promise<FriendSectionPageResponse> {
  const limit = Math.min(Math.max(Math.trunc(rawLimit), 1), 50);
  const cursor = decodeSectionCursor(rawCursor);
  const rows = section === "blocked"
    ? await loadBlockedPage(currentUserId, cursor, limit)
    : await loadRelationshipPage(currentUserId, section, cursor, limit);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);

  return {
    section,
    items: pageRows.map((row) => ({
      profile: {
        id: row.id,
        username: row.username,
        avatarUrl: row.avatarUrl,
      },
      occurredAt: row.occurredAt,
    })),
    nextCursor: hasMore && last
      ? encodeSectionCursor({ username: last.username, userId: last.id })
      : null,
  };
}

type SectionCursor = z.infer<typeof sectionCursorSchema>;
type SectionPageRow = {
  id: string;
  username: string;
  avatarUrl: string | null;
  occurredAt: Date;
};

async function loadRelationshipPage(
  currentUserId: string,
  section: Exclude<FriendSection, "blocked">,
  cursor: SectionCursor | null,
  limit: number,
): Promise<SectionPageRow[]> {
  const otherUserId = sql<string>`case
    when ${friendships.userOneId} = ${currentUserId}::uuid then ${friendships.userTwoId}
    else ${friendships.userOneId}
  end`;
  const occurredAt = section === "friends"
    ? sql<Date>`coalesce(${friendships.respondedAt}, ${friendships.updatedAt})`
    : friendships.createdAt;
  const sectionCondition = section === "friends"
    ? eq(friendships.status, "accepted")
    : and(
        eq(friendships.status, "pending"),
        section === "incoming"
          ? ne(friendships.requestedById, currentUserId)
          : eq(friendships.requestedById, currentUserId),
      );

  return db
    .select({
      id: users.id,
      username: sql<string>`${users.username}`,
      avatarUrl: users.avatarUrl,
      occurredAt,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, otherUserId))
    .where(and(
      or(
        eq(friendships.userOneId, currentUserId),
        eq(friendships.userTwoId, currentUserId),
      ),
      sectionCondition,
      isNotNull(users.username),
      isNotNull(users.profileOnboardedAt),
      notExists(
        db
          .select({ value: sql`1` })
          .from(userBlocks)
          .where(or(
            and(
              eq(userBlocks.blockerId, currentUserId),
              eq(userBlocks.blockedId, users.id),
            ),
            and(
              eq(userBlocks.blockerId, users.id),
              eq(userBlocks.blockedId, currentUserId),
            ),
          )),
      ),
      cursorCondition(cursor),
    ))
    .orderBy(asc(users.username), asc(users.id))
    .limit(limit + 1);
}

async function loadBlockedPage(
  currentUserId: string,
  cursor: SectionCursor | null,
  limit: number,
): Promise<SectionPageRow[]> {
  return db
    .select({
      id: users.id,
      username: sql<string>`${users.username}`,
      avatarUrl: users.avatarUrl,
      occurredAt: userBlocks.createdAt,
    })
    .from(userBlocks)
    .innerJoin(users, eq(users.id, userBlocks.blockedId))
    .where(and(
      eq(userBlocks.blockerId, currentUserId),
      isNotNull(users.username),
      isNotNull(users.profileOnboardedAt),
      cursorCondition(cursor),
    ))
    .orderBy(asc(users.username), asc(users.id))
    .limit(limit + 1);
}

function cursorCondition(cursor: SectionCursor | null) {
  if (!cursor) return undefined;
  return or(
    gt(users.username, cursor.username),
    and(
      eq(users.username, cursor.username),
      gt(users.id, cursor.userId),
    ),
  );
}

function encodeSectionCursor(cursor: SectionCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeSectionCursor(rawCursor: string | null): SectionCursor | null {
  if (!rawCursor) return null;
  try {
    return sectionCursorSchema.parse(
      JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8")),
    );
  } catch {
    throw new z.ZodError([{
      code: "custom",
      path: ["cursor"],
      message: "Invalid friends cursor.",
      input: rawCursor,
    }]);
  }
}

export async function findFighterByUsername(
  currentUserId: string,
  username: string,
): Promise<FighterConnection | null> {
  const profile = await loadFighterProfileByUsername(username);
  if (!profile) return null;
  return getVisibleFighterConnection(currentUserId, profile);
}

export async function getFighterProfileByUsername(
  currentUserId: string,
  username: string,
): Promise<FighterProfile | null> {
  const connection = await findFighterByUsername(currentUserId, username);
  if (!connection) return null;

  return {
    ...connection,
    stats: connection.relationship === "friends"
      ? await loadFriendStats(currentUserId, connection.profile.id)
      : null,
  };
}

async function getVisibleFighterConnection(
  currentUserId: string,
  profile: FighterSummary,
): Promise<FighterConnection | null> {
  if (currentUserId === profile.id) {
    return {
      profile,
      relationship: "self",
      requestedAt: null,
      connectedAt: null,
    };
  }

  const pair = canonicalFriendPair(currentUserId, profile.id);
  const [blockRows, relationshipRows] = await Promise.all([
    db
      .select({ blockerId: userBlocks.blockerId })
      .from(userBlocks)
      .where(
        or(
          and(
            eq(userBlocks.blockerId, currentUserId),
            eq(userBlocks.blockedId, profile.id),
          ),
          and(
            eq(userBlocks.blockerId, profile.id),
            eq(userBlocks.blockedId, currentUserId),
          ),
        ),
      )
      .limit(1),
    db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.userOneId, pair.userOneId),
          eq(friendships.userTwoId, pair.userTwoId),
        ),
      )
      .limit(1),
  ]);

  const blockerId = blockRows[0]?.blockerId;
  if (blockerId && blockerId !== currentUserId) return null;
  if (blockerId === currentUserId) {
    return {
      profile,
      relationship: "blocked",
      requestedAt: null,
      connectedAt: null,
    };
  }

  const relationship = relationshipRows[0];
  return {
    profile,
    relationship: relationshipState(relationship, currentUserId),
    requestedAt: relationship?.status === "pending"
      ? relationship.createdAt
      : null,
    connectedAt: relationship?.status === "accepted"
      ? relationship.respondedAt ?? relationship.updatedAt
      : null,
  };
}

function relationshipState(
  relationship: RelationshipRow | undefined,
  currentUserId: string,
): FriendshipState {
  if (!relationship) return "none";
  if (relationship.status === "accepted") return "friends";
  return relationship.requestedById === currentUserId ? "outgoing" : "incoming";
}

async function loadFighterProfileByUsername(
  username: string,
): Promise<FighterSummary | null> {
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(
      and(
        eq(users.username, username),
        isNotNull(users.profileOnboardedAt),
      ),
    )
    .limit(1);

  return toFighterSummary(row);
}

async function loadFriendStats(
  currentUserId: string,
  friendUserId: string,
): Promise<FighterProfile["stats"]> {
  const pair = canonicalFriendPair(currentUserId, friendUserId);

  return db.transaction(async (tx) => {
    const acceptedRows = await tx
      .select({ status: friendships.status })
      .from(friendships)
      .where(
        and(
          eq(friendships.userOneId, pair.userOneId),
          eq(friendships.userTwoId, pair.userTwoId),
          eq(friendships.status, "accepted"),
        ),
      )
      .for("share")
      .limit(1);
    if (!acceptedRows[0]) return null;

    const [drillTotalRows, methodRows] = await Promise.all([
      tx
        .select({ count: countDistinct(drills.id) })
        .from(drills)
        .where(eq(drills.userId, friendUserId)),
      tx
        .select({
          id: trainingMethods.id,
          name: trainingMethods.name,
          slug: trainingMethods.slug,
          iconKey: trainingMethods.iconKey,
          count: countDistinct(drills.id),
        })
        .from(drills)
        .innerJoin(
          drillTrainingMethods,
          eq(drillTrainingMethods.drillId, drills.id),
        )
        .innerJoin(
          trainingMethods,
          eq(trainingMethods.id, drillTrainingMethods.trainingMethodId),
        )
        .where(
          and(
            eq(drills.userId, friendUserId),
            eq(trainingMethods.active, true),
          ),
        )
        .groupBy(
          trainingMethods.id,
          trainingMethods.name,
          trainingMethods.slug,
          trainingMethods.iconKey,
          trainingMethods.sortOrder,
        )
        .orderBy(asc(trainingMethods.sortOrder), asc(trainingMethods.name)),
    ]);

    return {
      drillCount: drillTotalRows[0]?.count ?? 0,
      trainingMethods: methodRows,
    };
  });
}

function toFighterSummary(
  row: FriendProfileRow | undefined,
): FighterSummary | null {
  if (!row?.username) return null;
  return {
    id: row.id,
    username: row.username,
    avatarUrl: row.avatarUrl,
  };
}
