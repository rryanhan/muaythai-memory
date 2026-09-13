import {
  and,
  eq,
  exists,
  isNotNull,
  notExists,
  or,
  sql,
  type SQLWrapper,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  drillTags,
  drillTrainingMethods,
  drillShares,
  drills,
  follows,
  tagCategories,
  tags,
  trainingMethods,
  userBlocks,
  users,
} from "@/db/schema";
import { getDrillById } from "@/modules/drills/queries";
import type {
  DrillShareRecipientPage,
  SharedDrillDetailResponse,
  SharedDrillListItem,
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

type SharedDrillListQueryRow = {
  ownerAuthorized: boolean;
  drillId: string | null;
  drillTitle: string | null;
  drillSummary: string | null;
  trainingMethods: SharedDrillListItem["drill"]["trainingMethods"];
  tags: SharedDrillListItem["drill"]["tags"];
  customTags: SharedDrillListItem["drill"]["customTags"];
  drillCreatedAt: Date | string | null;
  drillUpdatedAt: Date | string | null;
  ownerId: string | null;
  ownerUsername: string | null;
  ownerAvatarUrl: string | null;
  sharedAt: Date | string | null;
  sharedAtCursor: string | null;
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
  const requestedOwnerUsername = ownerUsername || null;

  // Keep authorization, pagination, and relation hydration in one MVCC
  // snapshot so a concurrent share revocation cannot leak a hydrated drill.
  const rows = await db.execute<SharedDrillListQueryRow>(sql`
    with request_context as (
      select
        ${viewerUserId}::uuid as "viewerId",
        ${requestedOwnerUsername}::text as "ownerUsername",
        ${cursor?.sharedAt ?? null}::timestamptz as "cursorSharedAt",
        ${cursor?.drillId ?? null}::uuid as "cursorDrillId"
    ),
    authorized_owner as materialized (
      select ${users.id} as "id"
      from request_context
      inner join ${users}
        on ${users.username} = request_context."ownerUsername"
        and ${users.profileOnboardedAt} is not null
      where request_context."ownerUsername" is not null
        and ${users.id} <> request_context."viewerId"
        and exists (
          select 1
          from ${follows} as viewer_follow
          where viewer_follow."follower_id" = request_context."viewerId"
            and viewer_follow."following_id" = ${users.id}
            and viewer_follow."status" = 'accepted'
        )
        and exists (
          select 1
          from ${follows} as owner_follow
          where owner_follow."follower_id" = ${users.id}
            and owner_follow."following_id" = request_context."viewerId"
            and owner_follow."status" = 'accepted'
        )
        and not exists (
          select 1
          from ${userBlocks} as owner_block
          where (
            owner_block."blocker_id" = request_context."viewerId"
            and owner_block."blocked_id" = ${users.id}
          ) or (
            owner_block."blocker_id" = ${users.id}
            and owner_block."blocked_id" = request_context."viewerId"
          )
        )
      limit 1
    ),
    shared_page as materialized (
      select
        ${drills.id} as "drillId",
        ${drills.userId} as "ownerId",
        ${drills.title} as "drillTitle",
        ${drills.summary} as "drillSummary",
        ${drills.createdAt} as "drillCreatedAt",
        ${drills.updatedAt} as "drillUpdatedAt",
        ${users.username} as "ownerUsername",
        ${users.avatarUrl} as "ownerAvatarUrl",
        ${drillShares.createdAt} as "sharedAt",
        to_char(
          ${drillShares.createdAt} at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ) as "sharedAtCursor"
      from request_context
      inner join ${drillShares}
        on ${drillShares.recipientUserId} = request_context."viewerId"
      inner join ${drills} on ${drills.id} = ${drillShares.drillId}
      inner join ${users} on ${users.id} = ${drills.userId}
      where ${users.username} is not null
        and ${users.profileOnboardedAt} is not null
        and (
          request_context."ownerUsername" is null
          or ${drills.userId} = (select "id" from authorized_owner)
        )
        and exists (
          select 1
          from ${follows} as viewer_follow
          where viewer_follow."follower_id" = request_context."viewerId"
            and viewer_follow."following_id" = ${drills.userId}
            and viewer_follow."status" = 'accepted'
        )
        and exists (
          select 1
          from ${follows} as owner_follow
          where owner_follow."follower_id" = ${drills.userId}
            and owner_follow."following_id" = request_context."viewerId"
            and owner_follow."status" = 'accepted'
        )
        and not exists (
          select 1
          from ${userBlocks} as pair_block
          where (
            pair_block."blocker_id" = request_context."viewerId"
            and pair_block."blocked_id" = ${drills.userId}
          ) or (
            pair_block."blocker_id" = ${drills.userId}
            and pair_block."blocked_id" = request_context."viewerId"
          )
        )
        and (
          request_context."cursorSharedAt" is null
          or ${drillShares.createdAt} < request_context."cursorSharedAt"
          or (
            ${drillShares.createdAt} = request_context."cursorSharedAt"
            and ${drillShares.drillId} < request_context."cursorDrillId"
          )
        )
      order by ${drillShares.createdAt} desc, ${drillShares.drillId} desc
      limit 11
    ),
    method_payload as (
      select
        ${drillTrainingMethods.drillId} as "drillId",
        jsonb_agg(
          jsonb_build_object(
            'id', ${trainingMethods.id},
            'name', ${trainingMethods.name},
            'slug', ${trainingMethods.slug},
            'iconKey', ${trainingMethods.iconKey},
            'sortOrder', ${trainingMethods.sortOrder}
          )
          order by ${trainingMethods.sortOrder}, ${trainingMethods.name}
        ) as "trainingMethods"
      from shared_page
      inner join ${drillTrainingMethods}
        on ${drillTrainingMethods.drillId} = shared_page."drillId"
      inner join ${trainingMethods}
        on ${trainingMethods.id} = ${drillTrainingMethods.trainingMethodId}
      where ${trainingMethods.active} = true
      group by ${drillTrainingMethods.drillId}
    ),
    tag_rows as (
      select
        ${drillTags.drillId} as "drillId",
        case when ${tags.kind} = 'custom' then 'custom' else 'standard' end as "kind",
        jsonb_build_object(
          'id', ${tags.id},
          'name', ${tags.name},
          'slug', ${tags.slug},
          'kind', case when ${tags.kind} = 'custom' then 'custom' else 'standard' end,
          'sortOrder', ${tags.sortOrder},
          'category', case
            when ${tagCategories.id} is not null
              and ${tagCategories.name} <> ''
              and ${tagCategories.slug} <> ''
            then jsonb_build_object(
              'id', ${tagCategories.id},
              'name', ${tagCategories.name},
              'slug', ${tagCategories.slug}
            )
            else null
          end
        ) as "tag",
        ${tagCategories.sortOrder} as "categorySortOrder",
        ${tags.sortOrder} as "sortOrder",
        ${tags.name} as "name"
      from shared_page
      inner join ${drillTags} on ${drillTags.drillId} = shared_page."drillId"
      inner join ${tags} on ${tags.id} = ${drillTags.tagId}
      left join ${tagCategories} on ${tagCategories.id} = ${tags.categoryId}
      where ${tags.active} = true
        and (${tags.userId} is null or ${tags.userId} = shared_page."ownerId")
    ),
    tag_payload as (
      select
        tag_rows."drillId",
        coalesce(
          jsonb_agg(
            tag_rows."tag"
            order by tag_rows."categorySortOrder", tag_rows."sortOrder", tag_rows."name"
          ) filter (where tag_rows."kind" = 'standard'),
          '[]'::jsonb
        ) as "tags",
        coalesce(
          jsonb_agg(
            tag_rows."tag"
            order by tag_rows."categorySortOrder", tag_rows."sortOrder", tag_rows."name"
          ) filter (where tag_rows."kind" = 'custom'),
          '[]'::jsonb
        ) as "customTags"
      from tag_rows
      group by tag_rows."drillId"
    )
    select
      (
        request_context."ownerUsername" is null
        or authorized_owner."id" is not null
      ) as "ownerAuthorized",
      shared_page."drillId",
      shared_page."drillTitle",
      shared_page."drillSummary",
      coalesce(method_payload."trainingMethods", '[]'::jsonb) as "trainingMethods",
      coalesce(tag_payload."tags", '[]'::jsonb) as "tags",
      coalesce(tag_payload."customTags", '[]'::jsonb) as "customTags",
      shared_page."drillCreatedAt",
      shared_page."drillUpdatedAt",
      shared_page."ownerId",
      shared_page."ownerUsername",
      shared_page."ownerAvatarUrl",
      shared_page."sharedAt",
      shared_page."sharedAtCursor"
    from request_context
    left join authorized_owner on true
    left join shared_page on true
    left join method_payload on method_payload."drillId" = shared_page."drillId"
    left join tag_payload on tag_payload."drillId" = shared_page."drillId"
    order by shared_page."sharedAt" desc nulls last, shared_page."drillId" desc nulls last
  `);
  const contextRow = rows[0];
  if (!contextRow) throw new Error("Shared drill query returned no request context.");
  if (requestedOwnerUsername && !contextRow.ownerAuthorized) {
    throw new DrillShareError("Fighter not found.", 404);
  }

  const sharedRows = rows.flatMap((row) => {
    if (!row.drillId) return [];
    if (
      row.drillTitle === null
      || row.drillSummary === null
      || row.drillCreatedAt === null
      || row.drillUpdatedAt === null
      || row.ownerId === null
      || row.ownerUsername === null
      || row.sharedAt === null
      || row.sharedAtCursor === null
    ) {
      throw new Error("Shared drill query returned an incomplete drill.");
    }
    return [{
      drillId: row.drillId,
      drillTitle: row.drillTitle,
      drillSummary: row.drillSummary,
      trainingMethods: row.trainingMethods,
      tags: row.tags,
      customTags: row.customTags,
      drillCreatedAt: toDate(row.drillCreatedAt),
      drillUpdatedAt: toDate(row.drillUpdatedAt),
      ownerId: row.ownerId,
      ownerUsername: row.ownerUsername,
      ownerAvatarUrl: row.ownerAvatarUrl,
      sharedAt: toDate(row.sharedAt),
      sharedAtCursor: row.sharedAtCursor,
    }];
  });
  const hasMore = sharedRows.length > 10;
  const pageRows = hasMore ? sharedRows.slice(0, 10) : sharedRows;
  const last = pageRows.at(-1);

  return {
    items: pageRows.map((row) => ({
      drill: {
        id: row.drillId,
        title: row.drillTitle,
        summary: row.drillSummary,
        trainingMethods: row.trainingMethods,
        tags: row.tags,
        customTags: row.customTags,
        statusTags: [],
        createdAt: row.drillCreatedAt,
        updatedAt: row.drillUpdatedAt,
      },
      owner: {
        id: row.ownerId,
        username: row.ownerUsername,
        avatarUrl: row.ownerAvatarUrl,
      },
      sharedAt: row.sharedAt,
    })),
    nextCursor: hasMore && last
      ? encodeSharedCursor({
          sharedAt: last.sharedAtCursor,
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

function encodeSharedCursor(cursor: SharedCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
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
