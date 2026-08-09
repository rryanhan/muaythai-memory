import {
  and,
  asc,
  count,
  countDistinct,
  eq,
  gt,
  isNotNull,
  notExists,
  or,
  sql,
  type SQLWrapper,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  drillTrainingMethods,
  drills,
  follows,
  trainingMethods,
  userBlocks,
  users,
} from "@/db/schema";
import type {
  AuthorizedConnectionPageResponse,
  ConnectionCounts,
  ConnectionSection,
  ConnectionSectionPageResponse,
  FighterConnection,
  FighterProfile,
  FighterSummary,
  FollowDirection,
  PublicConnectionSection,
} from "./contracts";

type FighterProfileRow = {
  id: string;
  username: string | null;
  avatarUrl: string | null;
};

type FollowRow = typeof follows.$inferSelect;

const sectionCursorSchema = z.object({
  username: z.string().min(1).max(30),
  userId: z.string().uuid(),
});

type SectionCursor = z.infer<typeof sectionCursorSchema>;
type SectionPageRow = {
  id: string;
  username: string;
  avatarUrl: string | null;
  occurredAt: Date;
};

const emptyDirection = (): FollowDirection => ({
  status: "none",
  requestedAt: null,
  acceptedAt: null,
});

export async function getConnectionsSummary(
  currentUserId: string,
): Promise<{ counts: ConnectionCounts }> {
  const [followers, following, incoming, outgoing, blocked] = await Promise.all([
    countFollowRows(and(
      eq(follows.followingId, currentUserId),
      eq(follows.status, "accepted"),
    )),
    countFollowRows(and(
      eq(follows.followerId, currentUserId),
      eq(follows.status, "accepted"),
    )),
    countFollowRows(and(
      eq(follows.followingId, currentUserId),
      eq(follows.status, "pending"),
    )),
    countFollowRows(and(
      eq(follows.followerId, currentUserId),
      eq(follows.status, "pending"),
    )),
    db
      .select({ count: count() })
      .from(userBlocks)
      .where(eq(userBlocks.blockerId, currentUserId))
      .then((rows) => rows[0]?.count ?? 0),
  ]);

  return { counts: { followers, following, incoming, outgoing, blocked } };
}

export async function getConnectionSectionPage(
  currentUserId: string,
  section: ConnectionSection,
  rawCursor: string | null,
  rawLimit = 20,
): Promise<ConnectionSectionPageResponse> {
  const limit = Math.min(Math.max(Math.trunc(rawLimit), 1), 50);
  const cursor = decodeSectionCursor(rawCursor);
  const rows = section === "blocked"
    ? await loadBlockedPage(currentUserId, cursor, limit)
    : await loadFollowPage(currentUserId, section, cursor, limit);
  return toSectionPage(section, rows, limit);
}

export async function getAuthorizedConnectionPage(
  viewerUserId: string,
  ownerUsername: string,
  section: PublicConnectionSection,
  rawCursor: string | null,
  rawLimit = 20,
): Promise<AuthorizedConnectionPageResponse | null> {
  const owner = await loadFighterProfileByUsername(ownerUsername);
  if (!owner) return null;

  const isOwner = owner.id === viewerUserId;
  if (!isOwner && !(await hasReciprocalAcceptedFollows(viewerUserId, owner.id))) {
    return null;
  }

  const limit = Math.min(Math.max(Math.trunc(rawLimit), 1), 50);
  const cursor = decodeSectionCursor(rawCursor);
  const rows = await loadFollowPage(
    owner.id,
    section,
    cursor,
    limit,
    isOwner ? undefined : reciprocalAuthorizationCondition(viewerUserId, owner.id),
  );
  const page = toSectionPage(section, rows, limit);
  return { owner, ...page, section };
}

export async function getReciprocalConnectionPage(
  currentUserId: string,
  rawCursor: string | null,
  rawLimit = 20,
): Promise<ConnectionSectionPageResponse> {
  const limit = Math.min(Math.max(Math.trunc(rawLimit), 1), 50);
  const cursor = decodeSectionCursor(rawCursor);
  const rows = await db
    .select({
      id: users.id,
      username: sql<string>`${users.username}`,
      avatarUrl: users.avatarUrl,
      occurredAt: sql<Date>`coalesce(${follows.respondedAt}, ${follows.updatedAt})`,
    })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followingId))
    .where(and(
      eq(follows.followerId, currentUserId),
      eq(follows.status, "accepted"),
      isNotNull(users.username),
      isNotNull(users.profileOnboardedAt),
      reverseAcceptedCondition(currentUserId, users.id),
      noBlockCondition(currentUserId, users.id),
      cursorCondition(cursor),
    ))
    .orderBy(asc(users.username), asc(users.id))
    .limit(limit + 1);
  return toSectionPage("following", rows, limit);
}

export async function getReciprocalConnectionCount(
  currentUserId: string,
): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(follows)
    .where(and(
      eq(follows.followerId, currentUserId),
      eq(follows.status, "accepted"),
      reverseAcceptedCondition(currentUserId, follows.followingId),
    ));
  return rows[0]?.count ?? 0;
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

  const [socialCounts, stats] = await Promise.all([
    getPublicSocialCounts(connection.profile.id),
    connection.isSelf || connection.mutual
      ? loadPrivateTrainingStats(currentUserId, connection.profile.id)
      : Promise.resolve(null),
  ]);

  return {
    ...connection,
    socialCounts,
    canViewConnections: connection.isSelf || connection.mutual,
    stats,
  };
}

export async function hasReciprocalAcceptedFollows(
  firstUserId: string,
  secondUserId: string,
): Promise<boolean> {
  if (firstUserId === secondUserId) return true;
  const rows = await db
    .select({ followerId: follows.followerId })
    .from(follows)
    .where(and(
      eq(follows.status, "accepted"),
      or(
        and(
          eq(follows.followerId, firstUserId),
          eq(follows.followingId, secondUserId),
        ),
        and(
          eq(follows.followerId, secondUserId),
          eq(follows.followingId, firstUserId),
        ),
      ),
    ))
    .limit(2);
  return rows.length === 2;
}

async function getVisibleFighterConnection(
  currentUserId: string,
  profile: FighterSummary,
): Promise<FighterConnection | null> {
  if (currentUserId === profile.id) {
    return {
      profile,
      isSelf: true,
      blockedByViewer: false,
      outgoing: emptyDirection(),
      incoming: emptyDirection(),
      mutual: false,
    };
  }

  const [blockRows, followRows] = await Promise.all([
    db
      .select({ blockerId: userBlocks.blockerId })
      .from(userBlocks)
      .where(or(
        and(
          eq(userBlocks.blockerId, currentUserId),
          eq(userBlocks.blockedId, profile.id),
        ),
        and(
          eq(userBlocks.blockerId, profile.id),
          eq(userBlocks.blockedId, currentUserId),
        ),
      ))
      .limit(1),
    loadPairFollows(currentUserId, profile.id),
  ]);

  // Blocking makes profiles undiscoverable in either direction. A user can
  // still unblock someone from their own Blocked tab.
  if (blockRows[0]) return null;
  return connectionFromRows(profile, currentUserId, followRows);
}

function connectionFromRows(
  profile: FighterSummary,
  currentUserId: string,
  rows: FollowRow[],
): FighterConnection {
  const outgoingRow = rows.find((row) => row.followerId === currentUserId);
  const incomingRow = rows.find((row) => row.followingId === currentUserId);
  const outgoing = toDirection(outgoingRow);
  const incoming = toDirection(incomingRow);
  return {
    profile,
    isSelf: false,
    blockedByViewer: false,
    outgoing,
    incoming,
    mutual: outgoing.status === "accepted" && incoming.status === "accepted",
  };
}

function toDirection(row: FollowRow | undefined): FollowDirection {
  if (!row) return emptyDirection();
  return {
    status: row.status as "pending" | "accepted",
    requestedAt: row.createdAt,
    acceptedAt: row.status === "accepted"
      ? row.respondedAt ?? row.updatedAt
      : null,
  };
}

async function loadPairFollows(firstUserId: string, secondUserId: string) {
  return db
    .select()
    .from(follows)
    .where(or(
      and(
        eq(follows.followerId, firstUserId),
        eq(follows.followingId, secondUserId),
      ),
      and(
        eq(follows.followerId, secondUserId),
        eq(follows.followingId, firstUserId),
      ),
    ));
}

async function getPublicSocialCounts(userId: string) {
  const [followers, following] = await Promise.all([
    countFollowRows(and(
      eq(follows.followingId, userId),
      eq(follows.status, "accepted"),
    )),
    countFollowRows(and(
      eq(follows.followerId, userId),
      eq(follows.status, "accepted"),
    )),
  ]);
  return { followers, following };
}

async function countFollowRows(condition: ReturnType<typeof and>): Promise<number> {
  const rows = await db.select({ count: count() }).from(follows).where(condition);
  return rows[0]?.count ?? 0;
}

async function loadPrivateTrainingStats(
  viewerUserId: string,
  fighterUserId: string,
): Promise<FighterProfile["stats"]> {
  return db.transaction(async (tx) => {
    if (viewerUserId !== fighterUserId) {
      const rows = await tx
        .select({ followerId: follows.followerId })
        .from(follows)
        .where(and(
          eq(follows.status, "accepted"),
          or(
            and(
              eq(follows.followerId, viewerUserId),
              eq(follows.followingId, fighterUserId),
            ),
            and(
              eq(follows.followerId, fighterUserId),
              eq(follows.followingId, viewerUserId),
            ),
          ),
        ))
        .for("share")
        .limit(2);
      if (rows.length !== 2) return null;
    }

    const [drillTotalRows, methodRows] = await Promise.all([
      tx
        .select({ count: countDistinct(drills.id) })
        .from(drills)
        .where(eq(drills.userId, fighterUserId)),
      tx
        .select({
          id: trainingMethods.id,
          name: trainingMethods.name,
          slug: trainingMethods.slug,
          iconKey: trainingMethods.iconKey,
          count: countDistinct(drills.id),
        })
        .from(drills)
        .innerJoin(drillTrainingMethods, eq(drillTrainingMethods.drillId, drills.id))
        .innerJoin(trainingMethods, eq(trainingMethods.id, drillTrainingMethods.trainingMethodId))
        .where(and(
          eq(drills.userId, fighterUserId),
          eq(trainingMethods.active, true),
        ))
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

async function loadFighterProfileByUsername(
  username: string,
): Promise<FighterSummary | null> {
  const [row] = await db
    .select({ id: users.id, username: users.username, avatarUrl: users.avatarUrl })
    .from(users)
    .where(and(
      eq(users.username, username),
      isNotNull(users.profileOnboardedAt),
    ))
    .limit(1);
  return toFighterSummary(row);
}

async function loadFollowPage(
  currentUserId: string,
  section: Exclude<ConnectionSection, "blocked">,
  cursor: SectionCursor | null,
  limit: number,
  authorizationCondition?: ReturnType<typeof or>,
): Promise<SectionPageRow[]> {
  const profileId = section === "followers" || section === "incoming"
    ? follows.followerId
    : follows.followingId;
  const ownerCondition = section === "followers" || section === "incoming"
    ? eq(follows.followingId, currentUserId)
    : eq(follows.followerId, currentUserId);
  const status = section === "followers" || section === "following"
    ? "accepted"
    : "pending";
  const occurredAt = status === "accepted"
    ? sql<Date>`coalesce(${follows.respondedAt}, ${follows.updatedAt})`
    : follows.createdAt;

  return db
    .select({
      id: users.id,
      username: sql<string>`${users.username}`,
      avatarUrl: users.avatarUrl,
      occurredAt,
    })
    .from(follows)
    .innerJoin(users, eq(users.id, profileId))
    .where(and(
      ownerCondition,
      eq(follows.status, status),
      isNotNull(users.username),
      isNotNull(users.profileOnboardedAt),
      noBlockCondition(currentUserId, users.id),
      cursorCondition(cursor),
      authorizationCondition,
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

function noBlockCondition(firstUserId: string, secondUserId: SQLWrapper) {
  return notExists(
    db
      .select({ value: sql`1` })
      .from(userBlocks)
      .where(or(
        and(
          eq(userBlocks.blockerId, firstUserId),
          eq(userBlocks.blockedId, secondUserId),
        ),
        and(
          eq(userBlocks.blockerId, secondUserId),
          eq(userBlocks.blockedId, firstUserId),
        ),
      )),
  );
}

function reverseAcceptedCondition(
  currentUserId: string,
  otherUserId: SQLWrapper,
) {
  return sql<boolean>`exists (
    select 1 from "follows" as "reverse_follow"
    where "reverse_follow"."follower_id" = ${otherUserId}
      and "reverse_follow"."following_id" = ${currentUserId}::uuid
      and "reverse_follow"."status" = 'accepted'
  )`;
}

function reciprocalAuthorizationCondition(viewerUserId: string, ownerUserId: string) {
  return or(
    sql<boolean>`${viewerUserId}::uuid = ${ownerUserId}::uuid`,
    sql<boolean>`(
      exists (
        select 1 from "follows" as "viewer_follow"
        where "viewer_follow"."follower_id" = ${viewerUserId}::uuid
          and "viewer_follow"."following_id" = ${ownerUserId}::uuid
          and "viewer_follow"."status" = 'accepted'
      )
      and exists (
        select 1 from "follows" as "owner_follow"
        where "owner_follow"."follower_id" = ${ownerUserId}::uuid
          and "owner_follow"."following_id" = ${viewerUserId}::uuid
          and "owner_follow"."status" = 'accepted'
      )
    )`,
  );
}

function cursorCondition(cursor: SectionCursor | null) {
  if (!cursor) return undefined;
  return or(
    gt(users.username, cursor.username),
    and(eq(users.username, cursor.username), gt(users.id, cursor.userId)),
  );
}

function toSectionPage(
  section: ConnectionSection,
  rows: SectionPageRow[],
  limit: number,
): ConnectionSectionPageResponse {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);
  return {
    section,
    items: pageRows.map((row) => ({
      profile: { id: row.id, username: row.username, avatarUrl: row.avatarUrl },
      occurredAt: row.occurredAt,
    })),
    nextCursor: hasMore && last
      ? encodeSectionCursor({ username: last.username, userId: last.id })
      : null,
  };
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
      message: "Invalid connections cursor.",
      input: rawCursor,
    }]);
  }
}

function toFighterSummary(row: FighterProfileRow | undefined): FighterSummary | null {
  if (!row?.username) return null;
  return { id: row.id, username: row.username, avatarUrl: row.avatarUrl };
}
