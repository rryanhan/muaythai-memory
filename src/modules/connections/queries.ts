import {
  and,
  asc,
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

type FighterConnectionSnapshotRow = FighterProfileRow & {
  outgoingStatus: "pending" | "accepted" | null;
  outgoingRequestedAt: Date | string | null;
  outgoingAcceptedAt: Date | string | null;
  incomingStatus: "pending" | "accepted" | null;
  incomingRequestedAt: Date | string | null;
  incomingAcceptedAt: Date | string | null;
};

type FighterTrainingStats = NonNullable<FighterProfile["stats"]>;
type FighterProfileSnapshotRow = FighterConnectionSnapshotRow & {
  followers: number;
  following: number;
  canViewConnections: boolean;
  drillCount: number | null;
  trainingMethods: FighterTrainingStats["trainingMethods"] | null;
};

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
  const [counts] = await db.execute<ConnectionCounts>(sql`
    select
      inbound."followers",
      outbound."following",
      inbound."incoming",
      outbound."outgoing",
      block_counts."blocked"
    from (
      select
        count(*) filter (where ${follows.status} = 'accepted')::integer as "followers",
        count(*) filter (where ${follows.status} = 'pending')::integer as "incoming"
      from ${follows}
      where ${follows.followingId} = ${currentUserId}
    ) as inbound
    cross join (
      select
        count(*) filter (where ${follows.status} = 'accepted')::integer as "following",
        count(*) filter (where ${follows.status} = 'pending')::integer as "outgoing"
      from ${follows}
      where ${follows.followerId} = ${currentUserId}
    ) as outbound
    cross join (
      select count(*)::integer as "blocked"
      from ${userBlocks}
      where ${userBlocks.blockerId} = ${currentUserId}
    ) as block_counts
  `);

  if (!counts) throw new Error("Connection counts could not be loaded.");
  return { counts };
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

export async function findFighterByUsername(
  currentUserId: string,
  username: string,
): Promise<FighterConnection | null> {
  const [snapshot] = await db.execute<FighterConnectionSnapshotRow>(sql`
    with request_context as (
      select
        ${currentUserId}::uuid as "viewerId",
        ${username}::text as "username"
    )
    select
      ${users.id} as "id",
      ${users.username} as "username",
      ${users.avatarUrl} as "avatarUrl",
      outgoing_follow."status" as "outgoingStatus",
      outgoing_follow."created_at" as "outgoingRequestedAt",
      case
        when outgoing_follow."status" = 'accepted'
          then coalesce(outgoing_follow."responded_at", outgoing_follow."updated_at")
        else null
      end as "outgoingAcceptedAt",
      incoming_follow."status" as "incomingStatus",
      incoming_follow."created_at" as "incomingRequestedAt",
      case
        when incoming_follow."status" = 'accepted'
          then coalesce(incoming_follow."responded_at", incoming_follow."updated_at")
        else null
      end as "incomingAcceptedAt"
    from request_context
    inner join ${users}
      on ${users.username} = request_context."username"
      and ${users.profileOnboardedAt} is not null
    left join ${follows} as outgoing_follow
      on outgoing_follow."follower_id" = request_context."viewerId"
      and outgoing_follow."following_id" = ${users.id}
    left join ${follows} as incoming_follow
      on incoming_follow."follower_id" = ${users.id}
      and incoming_follow."following_id" = request_context."viewerId"
    where ${users.id} = request_context."viewerId"
      or not exists (
        select 1
        from ${userBlocks} as pair_block
        where (
          pair_block."blocker_id" = request_context."viewerId"
          and pair_block."blocked_id" = ${users.id}
        ) or (
          pair_block."blocker_id" = ${users.id}
          and pair_block."blocked_id" = request_context."viewerId"
        )
      )
    limit 1
  `);
  if (!snapshot) return null;
  return toFighterConnection(snapshot, currentUserId);
}

export async function getFighterProfileByUsername(
  currentUserId: string,
  username: string,
): Promise<FighterProfile | null> {
  const [snapshot] = await db.execute<FighterProfileSnapshotRow>(sql`
    with request_context as (
      select
        ${currentUserId}::uuid as "viewerId",
        ${username}::text as "username"
    ),
    visible_fighter as materialized (
      select
        ${users.id} as "id",
        ${users.username} as "username",
        ${users.avatarUrl} as "avatarUrl",
        outgoing_follow."status" as "outgoingStatus",
        outgoing_follow."created_at" as "outgoingRequestedAt",
        case
          when outgoing_follow."status" = 'accepted'
            then coalesce(outgoing_follow."responded_at", outgoing_follow."updated_at")
          else null
        end as "outgoingAcceptedAt",
        incoming_follow."status" as "incomingStatus",
        incoming_follow."created_at" as "incomingRequestedAt",
        case
          when incoming_follow."status" = 'accepted'
            then coalesce(incoming_follow."responded_at", incoming_follow."updated_at")
          else null
        end as "incomingAcceptedAt",
        (
          ${users.id} = request_context."viewerId"
          or (
            outgoing_follow."status" = 'accepted'
            and incoming_follow."status" = 'accepted'
          )
        ) as "canViewConnections"
      from request_context
      inner join ${users}
        on ${users.username} = request_context."username"
        and ${users.profileOnboardedAt} is not null
      left join ${follows} as outgoing_follow
        on outgoing_follow."follower_id" = request_context."viewerId"
        and outgoing_follow."following_id" = ${users.id}
      left join ${follows} as incoming_follow
        on incoming_follow."follower_id" = ${users.id}
        and incoming_follow."following_id" = request_context."viewerId"
      where ${users.id} = request_context."viewerId"
        or not exists (
          select 1
          from ${userBlocks} as pair_block
          where (
            pair_block."blocker_id" = request_context."viewerId"
            and pair_block."blocked_id" = ${users.id}
          ) or (
            pair_block."blocker_id" = ${users.id}
            and pair_block."blocked_id" = request_context."viewerId"
          )
        )
      limit 1
    )
    select
      visible_fighter.*,
      (
        select count(*)::integer
        from ${follows}
        where ${follows.followingId} = visible_fighter."id"
          and ${follows.status} = 'accepted'
      ) as "followers",
      (
        select count(*)::integer
        from ${follows}
        where ${follows.followerId} = visible_fighter."id"
          and ${follows.status} = 'accepted'
      ) as "following",
      private_stats."drillCount",
      private_stats."trainingMethods"
    from visible_fighter
    left join lateral (
      select
        (
          select count(*)::integer
          from ${drills}
          where ${drills.userId} = visible_fighter."id"
        ) as "drillCount",
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', method_counts."id",
              'name', method_counts."name",
              'slug', method_counts."slug",
              'iconKey', method_counts."iconKey",
              'count', method_counts."count"
            ) order by method_counts."sortOrder", method_counts."name"
          )
          from (
            select
              ${trainingMethods.id} as "id",
              ${trainingMethods.name} as "name",
              ${trainingMethods.slug} as "slug",
              ${trainingMethods.iconKey} as "iconKey",
              ${trainingMethods.sortOrder} as "sortOrder",
              count(distinct ${drills.id})::integer as "count"
            from ${drills}
            inner join ${drillTrainingMethods}
              on ${drillTrainingMethods.drillId} = ${drills.id}
            inner join ${trainingMethods}
              on ${trainingMethods.id} = ${drillTrainingMethods.trainingMethodId}
            where ${drills.userId} = visible_fighter."id"
              and ${trainingMethods.active} = true
            group by
              ${trainingMethods.id},
              ${trainingMethods.name},
              ${trainingMethods.slug},
              ${trainingMethods.iconKey},
              ${trainingMethods.sortOrder}
          ) as method_counts
        ), '[]'::jsonb) as "trainingMethods"
    ) as private_stats on visible_fighter."canViewConnections"
  `);
  if (!snapshot) return null;

  const connection = toFighterConnection(snapshot, currentUserId);
  const canViewConnections = connection.isSelf || connection.mutual;
  const stats = canViewConnections
    ? toFighterTrainingStats(snapshot)
    : null;

  return {
    ...connection,
    socialCounts: {
      followers: snapshot.followers,
      following: snapshot.following,
    },
    canViewConnections,
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

function toSnapshotDirection(
  status: "pending" | "accepted" | null,
  requestedAt: Date | string | null,
  acceptedAt: Date | string | null,
): FollowDirection {
  if (!status) return emptyDirection();
  if (!requestedAt) throw new Error("Visible fighter query returned an incomplete follow direction.");
  return {
    status,
    requestedAt: toConnectionDate(requestedAt),
    acceptedAt: status === "accepted" && acceptedAt
      ? toConnectionDate(acceptedAt)
      : null,
  };
}

function toConnectionDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toFighterConnection(
  snapshot: FighterConnectionSnapshotRow,
  currentUserId: string,
): FighterConnection {
  const profile = toFighterSummary(snapshot);
  if (!profile) throw new Error("Visible fighter query returned an incomplete profile.");
  if (profile.id === currentUserId) {
    return {
      profile,
      isSelf: true,
      blockedByViewer: false,
      outgoing: emptyDirection(),
      incoming: emptyDirection(),
      mutual: false,
    };
  }

  const outgoing = toSnapshotDirection(
    snapshot.outgoingStatus,
    snapshot.outgoingRequestedAt,
    snapshot.outgoingAcceptedAt,
  );
  const incoming = toSnapshotDirection(
    snapshot.incomingStatus,
    snapshot.incomingRequestedAt,
    snapshot.incomingAcceptedAt,
  );
  return {
    profile,
    isSelf: false,
    blockedByViewer: false,
    outgoing,
    incoming,
    mutual: outgoing.status === "accepted" && incoming.status === "accepted",
  };
}

function toFighterTrainingStats(snapshot: FighterProfileSnapshotRow): FighterTrainingStats {
  if (snapshot.drillCount === null || snapshot.trainingMethods === null) {
    throw new Error("Authorized fighter query returned incomplete private stats.");
  }
  return {
    drillCount: snapshot.drillCount,
    trainingMethods: snapshot.trainingMethods,
  };
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
