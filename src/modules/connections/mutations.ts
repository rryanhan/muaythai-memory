import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  or,
} from "drizzle-orm";
import { db } from "@/db/client";
import {
  drillShares,
  drills,
  follows,
  friendReports,
  userBlocks,
  users,
} from "@/db/schema";
import type {
  ConnectionMutationResponse,
  ReportFighterResponse,
  ReportReason,
  RespondToFollowRequestInput,
} from "./contracts";
import { ConnectionMutationError } from "./errors";
import { consumeConnectionRateLimit } from "./limits";

type ConnectionTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PairFollow = Pick<
  typeof follows.$inferSelect,
  "followerId" | "followingId" | "status" | "createdAt" | "respondedAt" | "updatedAt"
>;

export { ConnectionMutationError } from "./errors";

export async function requestFollow(
  currentUserId: string,
  username: string,
): Promise<ConnectionMutationResponse> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(
        eq(users.username, username),
        isNotNull(users.profileOnboardedAt),
      ))
      .limit(1);
    if (!target) throw fighterNotFound();
    if (target.id === currentUserId) {
      throw new ConnectionMutationError("You cannot follow your own profile.", 400);
    }

    await lockConnectionPair(tx, currentUserId, target.id);
    await assertPairCanConnect(tx, currentUserId, target.id);
    const existingRows = await loadPairFollows(tx, currentUserId, target.id);
    const outgoing = existingRows.find((row) => row.followerId === currentUserId);
    if (outgoing) return toMutationResponse(target.id, existingRows);

    const [pendingRows] = await tx
      .select({ count: count() })
      .from(follows)
      .where(and(
        eq(follows.followerId, currentUserId),
        eq(follows.status, "pending"),
      ));
    if ((pendingRows?.count ?? 0) >= 50) {
      throw new ConnectionMutationError(
        "You can have up to 50 pending follow requests. Cancel one before sending another.",
        409,
      );
    }

    await consumeConnectionRateLimit(currentUserId, "follow", tx);
    await tx
      .insert(follows)
      .values({ followerId: currentUserId, followingId: target.id })
      .onConflictDoNothing({ target: [follows.followerId, follows.followingId] });
    return toMutationResponse(
      target.id,
      await loadPairFollows(tx, currentUserId, target.id),
    );
  });
}

export async function cancelOrUnfollow(
  currentUserId: string,
  otherUserId: string,
): Promise<ConnectionMutationResponse> {
  if (currentUserId === otherUserId) throw followNotFound();

  return db.transaction(async (tx) => {
    await lockConnectionPair(tx, currentUserId, otherUserId);
    const before = await loadPairFollows(tx, currentUserId, otherUserId);
    const outgoing = before.find((row) => row.followerId === currentUserId);
    if (!outgoing) return toMutationResponse(otherUserId, before);
    const wasMutual = isMutual(before);

    await tx
      .delete(follows)
      .where(and(
        eq(follows.followerId, currentUserId),
        eq(follows.followingId, otherUserId),
      ));
    if (wasMutual) await revokePairShares(tx, currentUserId, otherUserId);

    return toMutationResponse(
      otherUserId,
      await loadPairFollows(tx, currentUserId, otherUserId),
    );
  });
}

export async function respondToFollowRequest(
  currentUserId: string,
  followerUserId: string,
  input: RespondToFollowRequestInput,
): Promise<ConnectionMutationResponse> {
  if (currentUserId === followerUserId) throw followRequestNotFound();

  return db.transaction(async (tx) => {
    await lockConnectionPair(tx, currentUserId, followerUserId);
    await assertPairCanConnect(tx, currentUserId, followerUserId);
    const before = await loadPairFollows(tx, currentUserId, followerUserId);
    const incoming = before.find((row) => row.followerId === followerUserId);

    if (input.action === "decline") {
      if (!incoming || incoming.status !== "pending") throw followRequestNotFound();
      await tx
        .delete(follows)
        .where(and(
          eq(follows.followerId, followerUserId),
          eq(follows.followingId, currentUserId),
          eq(follows.status, "pending"),
        ));
    } else if (incoming?.status === "accepted") {
      return toMutationResponse(followerUserId, before);
    } else {
      const now = new Date();
      const accepted = await tx
        .update(follows)
        .set({ status: "accepted", respondedAt: now, updatedAt: now })
        .where(and(
          eq(follows.followerId, followerUserId),
          eq(follows.followingId, currentUserId),
          eq(follows.status, "pending"),
        ))
        .returning({ followerId: follows.followerId });
      if (!accepted[0]) throw followRequestNotFound();
    }

    return toMutationResponse(
      followerUserId,
      await loadPairFollows(tx, currentUserId, followerUserId),
    );
  });
}

export async function blockFighter(
  currentUserId: string,
  otherUserId: string,
): Promise<ConnectionMutationResponse> {
  if (currentUserId === otherUserId) {
    throw new ConnectionMutationError("You cannot block your own profile.", 400);
  }

  return db.transaction(async (tx) => {
    await lockConnectionPair(tx, currentUserId, otherUserId);
    const [target] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(
        eq(users.id, otherUserId),
        isNotNull(users.profileOnboardedAt),
      ))
      .limit(1);
    if (!target) throw fighterNotFound();

    await tx
      .insert(userBlocks)
      .values({ blockerId: currentUserId, blockedId: otherUserId })
      .onConflictDoNothing({ target: [userBlocks.blockerId, userBlocks.blockedId] });
    await tx
      .delete(follows)
      .where(or(
        and(
          eq(follows.followerId, currentUserId),
          eq(follows.followingId, otherUserId),
        ),
        and(
          eq(follows.followerId, otherUserId),
          eq(follows.followingId, currentUserId),
        ),
      ));
    await revokePairShares(tx, currentUserId, otherUserId);
    return emptyMutationResponse(otherUserId, true);
  });
}

export async function unblockFighter(
  currentUserId: string,
  otherUserId: string,
): Promise<ConnectionMutationResponse> {
  const removed = await db
    .delete(userBlocks)
    .where(and(
      eq(userBlocks.blockerId, currentUserId),
      eq(userBlocks.blockedId, otherUserId),
    ))
    .returning({ blockedId: userBlocks.blockedId });
  if (!removed[0]) throw fighterNotFound();
  return emptyMutationResponse(otherUserId, false);
}

export async function reportFighter(
  currentUserId: string,
  otherUserId: string,
  reason: ReportReason,
  details: string | null,
): Promise<ReportFighterResponse> {
  if (currentUserId === otherUserId) {
    throw new ConnectionMutationError("You cannot report your own profile.", 400);
  }
  await consumeConnectionRateLimit(currentUserId, "report");

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.id, otherUserId),
      isNotNull(users.profileOnboardedAt),
    ))
    .limit(1);
  if (!target) throw fighterNotFound();

  const [report] = await db
    .insert(friendReports)
    .values({ reporterId: currentUserId, reportedId: otherUserId, reason, details })
    .returning({ id: friendReports.id });
  if (!report) throw new Error("Fighter report could not be stored.");
  return { reportId: report.id, reportedUserId: otherUserId };
}

async function lockConnectionPair(
  tx: ConnectionTransaction,
  firstUserId: string,
  secondUserId: string,
) {
  const lockedUsers = await tx
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, [firstUserId, secondUserId]))
    .orderBy(asc(users.id))
    .for("update");
  if (lockedUsers.length !== 2) throw fighterNotFound();
}

async function assertPairCanConnect(
  tx: ConnectionTransaction,
  currentUserId: string,
  otherUserId: string,
) {
  const [block] = await tx
    .select({ blockerId: userBlocks.blockerId })
    .from(userBlocks)
    .where(or(
      and(
        eq(userBlocks.blockerId, currentUserId),
        eq(userBlocks.blockedId, otherUserId),
      ),
      and(
        eq(userBlocks.blockerId, otherUserId),
        eq(userBlocks.blockedId, currentUserId),
      ),
    ))
    .limit(1);

  if (!block) return;
  if (block.blockerId === currentUserId) {
    throw new ConnectionMutationError(
      "Unblock this fighter before sending or accepting a follow request.",
      409,
    );
  }
  throw fighterNotFound();
}

async function loadPairFollows(
  tx: ConnectionTransaction,
  firstUserId: string,
  secondUserId: string,
): Promise<PairFollow[]> {
  return tx
    .select({
      followerId: follows.followerId,
      followingId: follows.followingId,
      status: follows.status,
      createdAt: follows.createdAt,
      respondedAt: follows.respondedAt,
      updatedAt: follows.updatedAt,
    })
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

function toMutationResponse(
  otherUserId: string,
  rows: PairFollow[],
): ConnectionMutationResponse {
  const outgoing = rows.find((row) => row.followingId === otherUserId);
  const incoming = rows.find((row) => row.followerId === otherUserId);
  const toDirection = (row: PairFollow | undefined) => row
    ? {
        status: row.status as "pending" | "accepted",
        requestedAt: row.createdAt,
        acceptedAt: row.status === "accepted"
          ? row.respondedAt ?? row.updatedAt
          : null,
      }
    : { status: "none" as const, requestedAt: null, acceptedAt: null };
  const outgoingDirection = toDirection(outgoing);
  const incomingDirection = toDirection(incoming);
  return {
    userId: otherUserId,
    blockedByViewer: false,
    outgoing: outgoingDirection,
    incoming: incomingDirection,
    mutual: outgoingDirection.status === "accepted"
      && incomingDirection.status === "accepted",
  };
}

function emptyMutationResponse(
  otherUserId: string,
  blockedByViewer: boolean,
): ConnectionMutationResponse {
  const none = { status: "none" as const, requestedAt: null, acceptedAt: null };
  return {
    userId: otherUserId,
    blockedByViewer,
    outgoing: none,
    incoming: none,
    mutual: false,
  };
}

function isMutual(rows: PairFollow[]): boolean {
  return rows.filter((row) => row.status === "accepted").length === 2;
}

export async function revokePairShares(
  tx: ConnectionTransaction,
  firstUserId: string,
  secondUserId: string,
) {
  const firstUserDrills = tx
    .select({ id: drills.id })
    .from(drills)
    .where(eq(drills.userId, firstUserId));
  const secondUserDrills = tx
    .select({ id: drills.id })
    .from(drills)
    .where(eq(drills.userId, secondUserId));

  await tx
    .delete(drillShares)
    .where(or(
      and(
        eq(drillShares.recipientUserId, secondUserId),
        inArray(drillShares.drillId, firstUserDrills),
      ),
      and(
        eq(drillShares.recipientUserId, firstUserId),
        inArray(drillShares.drillId, secondUserDrills),
      ),
    ));
}

function fighterNotFound() {
  return new ConnectionMutationError("Fighter not found.", 404);
}

function followRequestNotFound() {
  return new ConnectionMutationError("Follow request not found.", 404);
}

function followNotFound() {
  return new ConnectionMutationError("Follow relationship not found.", 404);
}
