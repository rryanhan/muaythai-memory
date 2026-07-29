import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, postgresClient } from "@/db/client";
import {
  drillTrainingMethods,
  drills,
  drillShares,
  friendRateLimits,
  friendReports,
  friendships,
  trainingMethods,
  userBlocks,
  users,
} from "@/db/schema";
import {
  blockFighter,
  cancelFriendRequest,
  FriendMutationError,
  removeFriend,
  reportFighter,
  respondToFriendRequest,
  sendFriendRequest,
  unblockFighter,
} from "./mutations";
import { consumeFriendRateLimit } from "./limits";
import {
  findFighterByUsername,
  getFriendSectionPage,
  getFighterProfileByUsername,
  getFriendsSummary,
} from "./queries";
import { canonicalFriendPair } from "./pair";
import {
  getSharedDrillById,
  listSharedDrills,
} from "@/modules/sharing/queries";
import { updateDrillShare } from "@/modules/sharing/mutations";

async function main() {
  const suffix = Date.now().toString(36);
  const userA = fixtureUser(`friend_verify_a_${suffix}`);
  const userB = fixtureUser(`friend_verify_b_${suffix}`);
  const userC = fixtureUser(`friend_verify_c_${suffix}`);
  const auxiliaryUserIds: string[] = [];

  try {
    const [method] = await db
      .select()
      .from(trainingMethods)
      .where(eq(trainingMethods.active, true))
      .orderBy(asc(trainingMethods.sortOrder))
      .limit(1);
    if (!method) throw new Error("Seed taxonomy is required for friends verification.");

    await db.insert(users).values([userA, userB, userC]);
    const [friendDrill] = await db
      .insert(drills)
      .values({
        userId: userB.id,
        title: "Friend verification drill",
        summary: "",
      })
      .returning();
    if (!friendDrill) throw new Error("Could not create friends verification drill.");
    await db.insert(drillTrainingMethods).values({
      drillId: friendDrill.id,
      trainingMethodId: method.id,
    });

    const sent = await sendFriendRequest(userA.id, userB.username);
    assert.equal(sent.relationship, "outgoing");
    assert.equal(
      (await sendFriendRequest(userA.id, userB.username)).relationship,
      "outgoing",
      "Repeating the same request should be idempotent.",
    );
    const [requestRate] = await db
      .select({ count: friendRateLimits.requestCount })
      .from(friendRateLimits)
      .where(and(
        eq(friendRateLimits.userId, userA.id),
        eq(friendRateLimits.action, "request"),
      ));
    assert.equal(
      requestRate?.count,
      1,
      "Repeating an existing request must not consume another request allowance.",
    );
    assert.equal(
      (await cancelFriendRequest(userA.id, userB.id)).relationship,
      "none",
    );
    assert.equal(
      (await cancelFriendRequest(userA.id, userB.id)).relationship,
      "none",
      "Cancelling an already-cancelled outgoing request should be idempotent.",
    );
    await sendFriendRequest(userA.id, userB.username);

    const [outgoingA, incomingB] = await Promise.all([
      getFriendSectionPage(userA.id, "outgoing", null),
      getFriendSectionPage(userB.id, "incoming", null),
    ]);
    assert.equal(outgoingA.items[0]?.profile.id, userB.id);
    assert.equal(incomingB.items[0]?.profile.id, userA.id);
    await expectFriendError(
      () => respondToFriendRequest(userA.id, userB.id, { action: "accept" }),
      404,
    );

    await respondToFriendRequest(userB.id, userA.id, { action: "accept" });
    const acceptedProfile = await getFighterProfileByUsername(
      userA.id,
      userB.username,
    );
    assert.equal(acceptedProfile?.relationship, "friends");
    assert.equal(acceptedProfile?.stats?.drillCount, 1);
    assert.equal(acceptedProfile?.stats?.trainingMethods[0]?.id, method.id);

    await updateDrillShare(userB.id, friendDrill.id, userA.id, true);
    assert.equal(
      (await listSharedDrills(userA.id, null, userB.username)).items[0]?.drill.id,
      friendDrill.id,
    );
    assert.equal(
      (await getSharedDrillById(userA.id, friendDrill.id))?.owner.id,
      userB.id,
    );
    assert.equal(
      await getSharedDrillById(userC.id, friendDrill.id),
      null,
      "A drill share must not be visible to a different user.",
    );

    const privateProfile = await getFighterProfileByUsername(
      userC.id,
      userB.username,
    );
    assert.equal(privateProfile?.relationship, "none");
    assert.equal(
      privateProfile?.stats,
      null,
      "Training totals must remain private before friendship.",
    );

    await removeFriend(userA.id, userB.id);
    assert.equal(
      (await db
        .select()
        .from(drillShares)
        .where(eq(drillShares.drillId, friendDrill.id))).length,
      0,
      "Removing a friend must revoke shared drills in both directions.",
    );
    await sendFriendRequest(userB.id, userA.username);
    await respondToFriendRequest(userA.id, userB.id, { action: "decline" });
    assert.equal(
      (await getFriendSectionPage(userA.id, "incoming", null)).items.length,
      0,
    );

    await sendFriendRequest(userA.id, userB.username);
    await respondToFriendRequest(userB.id, userA.id, { action: "accept" });
    await blockFighter(userA.id, userB.id);
    const pair = canonicalFriendPair(userA.id, userB.id);
    assert.equal(
      (await findFighterByUsername(userA.id, userB.username))?.relationship,
      "blocked",
    );
    assert.equal(
      await findFighterByUsername(userB.id, userA.username),
      null,
      "A blocked user must not discover the blocker.",
    );
    assert.equal(
      (await db
        .select()
        .from(friendships)
        .where(and(
          eq(friendships.userOneId, pair.userOneId),
          eq(friendships.userTwoId, pair.userTwoId),
        ))).length,
      0,
      "Blocking must remove the friendship.",
    );
    assert.equal(
      (await db
        .select()
        .from(userBlocks)
        .where(and(
          eq(userBlocks.blockerId, userA.id),
          eq(userBlocks.blockedId, userB.id),
        ))).length,
      1,
    );

    await unblockFighter(userA.id, userB.id);
    assert.equal(
      (await findFighterByUsername(userA.id, userB.username))?.relationship,
      "none",
    );

    const reverseRace = await Promise.allSettled([
      sendFriendRequest(userA.id, userC.username),
      sendFriendRequest(userC.id, userA.username),
    ]);
    assert.equal(
      reverseRace.filter((result) => result.status === "fulfilled").length,
      1,
      "Concurrent reverse requests must create only one directed request.",
    );
    const racePair = canonicalFriendPair(userA.id, userC.id);
    const [raceRelationship] = await db
      .select()
      .from(friendships)
      .where(and(
        eq(friendships.userOneId, racePair.userOneId),
        eq(friendships.userTwoId, racePair.userTwoId),
      ));
    assert.equal(raceRelationship?.status, "pending");
    const raceRecipientId = raceRelationship?.requestedById === userA.id
      ? userC.id
      : userA.id;
    const raceRequesterId = raceRelationship?.requestedById;
    if (!raceRequesterId) throw new Error("Reverse request race did not preserve a requester.");
    await respondToFriendRequest(
      raceRecipientId,
      raceRequesterId,
      { action: "decline" },
    );

    await Promise.allSettled([
      sendFriendRequest(userA.id, userC.username),
      blockFighter(userC.id, userA.id),
    ]);
    assert.equal(
      (await db
        .select()
        .from(friendships)
        .where(and(
          eq(friendships.userOneId, racePair.userOneId),
          eq(friendships.userTwoId, racePair.userTwoId),
        ))).length,
      0,
      "A concurrent block must leave no surviving friend request.",
    );
    await unblockFighter(userC.id, userA.id);

    const report = await reportFighter(
      userC.id,
      userB.id,
      "spam",
      "Verification report.",
    );
    assert.equal(report.reportedUserId, userB.id);
    assert.equal(
      (await db
        .select()
        .from(friendReports)
        .where(eq(friendReports.id, report.reportId))).length,
      1,
    );
    for (let index = 0; index < 4; index += 1) {
      await reportFighter(userC.id, userB.id, "spam", null);
    }
    await expectFriendError(
      () => reportFighter(userC.id, userB.id, "spam", null),
      429,
    );

    const paginatedUsers = Array.from({ length: 22 }, (_, index) => (
      fixtureUser(`page_${String(index).padStart(2, "0")}_${suffix}`)
    ));
    auxiliaryUserIds.push(...paginatedUsers.map((user) => user.id));
    await db.insert(users).values(paginatedUsers);
    await db.insert(friendships).values(paginatedUsers.map((user) => ({
      ...canonicalFriendPair(userA.id, user.id),
      requestedById: userA.id,
      status: "accepted",
      respondedAt: new Date(),
    })));
    const firstPage = await getFriendSectionPage(userA.id, "friends", null, 20);
    assert.equal(firstPage.items.length, 20);
    assert.ok(firstPage.nextCursor);
    const secondPage = await getFriendSectionPage(
      userA.id,
      "friends",
      firstPage.nextCursor,
      20,
    );
    assert.equal(secondPage.items.length, 2);
    assert.equal(secondPage.nextCursor, null);
    assert.equal((await getFriendsSummary(userA.id)).counts.friends, 22);

    const cappedUsers = Array.from({ length: 51 }, (_, index) => (
      fixtureUser(`cap_${String(index).padStart(2, "0")}_${suffix}`)
    ));
    auxiliaryUserIds.push(...cappedUsers.map((user) => user.id));
    await db.insert(users).values(cappedUsers);
    await db.insert(friendships).values(cappedUsers.slice(0, 50).map((user) => ({
      ...canonicalFriendPair(userA.id, user.id),
      requestedById: userA.id,
    })));
    await expectFriendError(
      () => sendFriendRequest(userA.id, cappedUsers[50]!.username),
      409,
    );

    for (let index = 0; index < 30; index += 1) {
      await consumeFriendRateLimit(userB.id, "search");
    }
    await expectFriendError(
      () => consumeFriendRateLimit(userB.id, "search"),
      429,
    );

    console.log(
      "Friends verification passed: request lifecycle, pagination, limits, reports, sharing, privacy, revocation, concurrency, removal, and blocking are isolated.",
    );
  } finally {
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(users).where(eq(users.id, userB.id));
    await db.delete(users).where(eq(users.id, userC.id));
    if (auxiliaryUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, auxiliaryUserIds));
    }
  }
}

async function expectFriendError(
  operation: () => Promise<unknown>,
  status: number,
) {
  await assert.rejects(operation, (error) => (
    error instanceof FriendMutationError && error.status === status
  ));
}

function fixtureUser(username: string) {
  const now = new Date();
  return {
    id: randomUUID(),
    displayName: username,
    username,
    profileOnboardedAt: now,
    firstDrillGuideCompletedAt: now,
  };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgresClient.end();
  });
