import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  ne,
  or,
} from "drizzle-orm";
import { db } from "@/db/client";
import {
  drillShares,
  drills,
  friendReports,
  friendships,
  userBlocks,
  users,
} from "@/db/schema";
import type {
  FriendReportReason,
  FriendMutationResponse,
  ReportFighterResponse,
  RespondToFriendRequestInput,
} from "./contracts";
import { FriendMutationError } from "./errors";
import { consumeFriendRateLimit } from "./limits";
import { canonicalFriendPair, type FriendPair } from "./pair";

type FriendsTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export { FriendMutationError } from "./errors";

export async function sendFriendRequest(
  currentUserId: string,
  username: string,
): Promise<FriendMutationResponse> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.username, username),
          isNotNull(users.profileOnboardedAt),
        ),
      )
      .limit(1);
    if (!target) throw fighterNotFound();
    if (target.id === currentUserId) {
      throw new FriendMutationError("You cannot send a friend request to yourself.", 400);
    }

    const pair = canonicalFriendPair(currentUserId, target.id);
    await lockFriendPair(tx, pair);
    await assertPairCanConnect(tx, currentUserId, target.id);

    const [existing] = await loadRelationship(tx, pair);
    if (existing?.status === "accepted") {
      return { userId: target.id, relationship: "friends" };
    }
    if (existing?.requestedById === currentUserId) {
      return { userId: target.id, relationship: "outgoing" };
    }
    if (existing) {
      throw new FriendMutationError(
        "This fighter already sent you a request. Respond from your Requests list.",
        409,
      );
    }

    const [outgoingCount] = await tx
      .select({ count: count() })
      .from(friendships)
      .where(and(
        eq(friendships.status, "pending"),
        eq(friendships.requestedById, currentUserId),
      ));
    if ((outgoingCount?.count ?? 0) >= 50) {
      throw new FriendMutationError(
        "You can have up to 50 pending friend requests. Cancel one before sending another.",
        409,
      );
    }

    await consumeFriendRateLimit(currentUserId, "request", tx);
    await tx.insert(friendships).values({
      ...pair,
      requestedById: currentUserId,
    });
    return { userId: target.id, relationship: "outgoing" };
  });
}

export async function cancelFriendRequest(
  currentUserId: string,
  otherUserId: string,
): Promise<FriendMutationResponse> {
  if (currentUserId === otherUserId) throw friendRequestNotFound();
  const pair = canonicalFriendPair(currentUserId, otherUserId);

  return db.transaction(async (tx) => {
    await lockFriendPair(tx, pair);
    const [existing] = await loadRelationship(tx, pair);
    if (!existing) return { userId: otherUserId, relationship: "none" };
    if (existing.status === "accepted" || existing.requestedById !== currentUserId) {
      throw friendRequestNotFound();
    }

    await tx
      .delete(friendships)
      .where(and(
        eq(friendships.userOneId, pair.userOneId),
        eq(friendships.userTwoId, pair.userTwoId),
        eq(friendships.status, "pending"),
        eq(friendships.requestedById, currentUserId),
      ));
    return { userId: otherUserId, relationship: "none" };
  });
}

export async function respondToFriendRequest(
  currentUserId: string,
  otherUserId: string,
  input: RespondToFriendRequestInput,
): Promise<FriendMutationResponse> {
  if (currentUserId === otherUserId) throw friendRequestNotFound();
  const pair = canonicalFriendPair(currentUserId, otherUserId);

  return db.transaction(async (tx) => {
    await lockFriendPair(tx, pair);
    await assertPairCanConnect(tx, currentUserId, otherUserId);

    if (input.action === "decline") {
      const removed = await tx
        .delete(friendships)
        .where(
          and(
            eq(friendships.userOneId, pair.userOneId),
            eq(friendships.userTwoId, pair.userTwoId),
            eq(friendships.status, "pending"),
            ne(friendships.requestedById, currentUserId),
          ),
        )
        .returning({ requestedById: friendships.requestedById });
      if (!removed[0]) throw friendRequestNotFound();
      return { userId: otherUserId, relationship: "none" };
    }

    const now = new Date();
    const accepted = await tx
      .update(friendships)
      .set({
        status: "accepted",
        respondedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(friendships.userOneId, pair.userOneId),
          eq(friendships.userTwoId, pair.userTwoId),
          eq(friendships.status, "pending"),
          ne(friendships.requestedById, currentUserId),
        ),
      )
      .returning({ requestedById: friendships.requestedById });
    if (!accepted[0]) throw friendRequestNotFound();
    return { userId: otherUserId, relationship: "friends" };
  });
}

export async function removeFriend(
  currentUserId: string,
  otherUserId: string,
): Promise<{ removedUserId: string }> {
  if (currentUserId === otherUserId) throw friendshipNotFound();
  const pair = canonicalFriendPair(currentUserId, otherUserId);

  return db.transaction(async (tx) => {
    await lockFriendPair(tx, pair);
    const removed = await tx
      .delete(friendships)
      .where(
        and(
          eq(friendships.userOneId, pair.userOneId),
          eq(friendships.userTwoId, pair.userTwoId),
          eq(friendships.status, "accepted"),
        ),
      )
      .returning({ userOneId: friendships.userOneId });
    if (!removed[0]) throw friendshipNotFound();
    await revokePairShares(tx, currentUserId, otherUserId);
    return { removedUserId: otherUserId };
  });
}

export async function blockFighter(
  currentUserId: string,
  otherUserId: string,
): Promise<FriendMutationResponse> {
  if (currentUserId === otherUserId) {
    throw new FriendMutationError("You cannot block your own profile.", 400);
  }
  const pair = canonicalFriendPair(currentUserId, otherUserId);

  return db.transaction(async (tx) => {
    await lockFriendPair(tx, pair);
    const targetExists = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, otherUserId),
          isNotNull(users.profileOnboardedAt),
        ),
      )
      .limit(1);
    if (!targetExists[0]) throw fighterNotFound();

    await tx
      .insert(userBlocks)
      .values({ blockerId: currentUserId, blockedId: otherUserId })
      .onConflictDoNothing({
        target: [userBlocks.blockerId, userBlocks.blockedId],
      });
    await tx
      .delete(friendships)
      .where(
        and(
          eq(friendships.userOneId, pair.userOneId),
          eq(friendships.userTwoId, pair.userTwoId),
        ),
      );
    await revokePairShares(tx, currentUserId, otherUserId);
    return { userId: otherUserId, relationship: "blocked" };
  });
}

export async function reportFighter(
  currentUserId: string,
  otherUserId: string,
  reason: FriendReportReason,
  details: string | null,
): Promise<ReportFighterResponse> {
  if (currentUserId === otherUserId) {
    throw new FriendMutationError("You cannot report your own profile.", 400);
  }
  await consumeFriendRateLimit(currentUserId, "report");

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
    .values({
      reporterId: currentUserId,
      reportedId: otherUserId,
      reason,
      details,
    })
    .returning({ id: friendReports.id });
  if (!report) throw new Error("Friend report could not be stored.");
  return { reportId: report.id, reportedUserId: otherUserId };
}

export async function unblockFighter(
  currentUserId: string,
  otherUserId: string,
): Promise<FriendMutationResponse> {
  const removed = await db
    .delete(userBlocks)
    .where(
      and(
        eq(userBlocks.blockerId, currentUserId),
        eq(userBlocks.blockedId, otherUserId),
      ),
    )
    .returning({ blockedId: userBlocks.blockedId });
  if (!removed[0]) throw fighterNotFound();
  return { userId: otherUserId, relationship: "none" };
}

async function lockFriendPair(
  tx: FriendsTransaction,
  pair: FriendPair,
) {
  const lockedUsers = await tx
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, [pair.userOneId, pair.userTwoId]))
    .orderBy(asc(users.id))
    .for("update");
  if (lockedUsers.length !== 2) throw fighterNotFound();
}

async function assertPairCanConnect(
  tx: FriendsTransaction,
  currentUserId: string,
  otherUserId: string,
) {
  const [block] = await tx
    .select({ blockerId: userBlocks.blockerId })
    .from(userBlocks)
    .where(
      or(
        and(
          eq(userBlocks.blockerId, currentUserId),
          eq(userBlocks.blockedId, otherUserId),
        ),
        and(
          eq(userBlocks.blockerId, otherUserId),
          eq(userBlocks.blockedId, currentUserId),
        ),
      ),
    )
    .limit(1);

  if (!block) return;
  if (block.blockerId === currentUserId) {
    throw new FriendMutationError(
      "Unblock this fighter before sending or accepting a request.",
      409,
    );
  }
  throw fighterNotFound();
}

async function revokePairShares(
  tx: FriendsTransaction,
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

function loadRelationship(
  tx: FriendsTransaction,
  pair: FriendPair,
) {
  return tx
    .select({
      requestedById: friendships.requestedById,
      status: friendships.status,
    })
    .from(friendships)
    .where(
      and(
        eq(friendships.userOneId, pair.userOneId),
        eq(friendships.userTwoId, pair.userTwoId),
      ),
    )
    .limit(1);
}

function fighterNotFound() {
  return new FriendMutationError("Fighter not found.", 404);
}

function friendRequestNotFound() {
  return new FriendMutationError("Friend request not found.", 404);
}

function friendshipNotFound() {
  return new FriendMutationError("Friendship not found.", 404);
}
