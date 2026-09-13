import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { db, postgresClient } from "@/db/client";
import {
  drillShares,
  drills,
  drillTrainingMethods,
  follows,
  friendRateLimits,
  friendReports,
  trainingMethods,
  userBlocks,
  users,
} from "@/db/schema";
import { updateDrillShare } from "@/modules/sharing/mutations";
import {
  getDrillShareRecipientPage,
  getSharedDrillById,
  listSharedDrills,
} from "@/modules/sharing/queries";
import { ConnectionMutationError } from "./errors";
import { consumeConnectionRateLimit } from "./limits";
import {
  blockFighter,
  cancelOrUnfollow,
  reportFighter,
  requestFollow,
  respondToFollowRequest,
  unblockFighter,
} from "./mutations";
import {
  findFighterByUsername,
  getAuthorizedConnectionPage,
  getConnectionSectionPage,
  getConnectionsSummary,
  getFighterProfileByUsername,
} from "./queries";

async function main() {
  const suffix = Date.now().toString(36);
  const userA = fixtureUser(`follow_verify_a_${suffix}`);
  const userB = fixtureUser(`follow_verify_b_${suffix}`);
  const userC = fixtureUser(`follow_verify_c_${suffix}`);
  const auxiliaryUserIds: string[] = [];

  try {
    const [method] = await db
      .select()
      .from(trainingMethods)
      .where(eq(trainingMethods.active, true))
      .orderBy(asc(trainingMethods.sortOrder))
      .limit(1);
    if (!method) throw new Error("Seed taxonomy is required for follow verification.");

    await db.insert(users).values([userA, userB, userC]);
    const [fighterDrill] = await db
      .insert(drills)
      .values({ userId: userB.id, title: "Follow verification drill", summary: "" })
      .returning();
    if (!fighterDrill) throw new Error("Could not create follow verification drill.");
    await db.insert(drillTrainingMethods).values({
      drillId: fighterDrill.id,
      trainingMethodId: method.id,
    });

    const sent = await requestFollow(userA.id, userB.username);
    assert.equal(sent.outgoing.status, "pending");
    assert.equal(
      (await requestFollow(userA.id, userB.username)).outgoing.status,
      "pending",
      "Repeating the same follow request should be idempotent.",
    );
    const [followRate] = await db
      .select({ count: friendRateLimits.requestCount })
      .from(friendRateLimits)
      .where(and(
        eq(friendRateLimits.userId, userA.id),
        eq(friendRateLimits.action, "follow"),
      ));
    assert.equal(followRate?.count, 1, "An idempotent retry must not consume rate allowance.");

    // A crossed request is valid: both directions remain pending until each
    // recipient approves independently.
    assert.equal(
      (await requestFollow(userB.id, userA.username)).outgoing.status,
      "pending",
    );
    const crossedRows = await loadPairRows(userA.id, userB.id);
    assert.equal(crossedRows.length, 2);
    assert.ok(crossedRows.every((row) => row.status === "pending"));

    const [outgoingA, incomingB] = await Promise.all([
      getConnectionSectionPage(userA.id, "outgoing", null),
      getConnectionSectionPage(userB.id, "incoming", null),
    ]);
    assert.equal(outgoingA.items[0]?.profile.id, userB.id);
    assert.equal(incomingB.items[0]?.profile.id, userA.id);
    await expectConnectionError(
      () => respondToFollowRequest(userA.id, userA.id, { action: "accept" }),
      404,
    );

    await respondToFollowRequest(userB.id, userA.id, { action: "accept" });
    const oneWayProfile = await getFighterProfileByUsername(userA.id, userB.username);
    assert.equal(oneWayProfile?.outgoing.status, "accepted");
    assert.equal(oneWayProfile?.incoming.status, "pending");
    assert.equal(oneWayProfile?.mutual, false);
    assert.equal(oneWayProfile?.stats, null, "One-way follows must not expose training totals.");
    await assert.rejects(
      () => updateDrillShare(userB.id, fighterDrill.id, userA.id, true),
      /follow each other/i,
    );

    await respondToFollowRequest(userA.id, userB.id, { action: "accept" });
    assert.equal(
      (await respondToFollowRequest(userA.id, userB.id, { action: "accept" })).mutual,
      true,
      "Accepting an already accepted request should be idempotent.",
    );
    const mutualProfile = await getFighterProfileByUsername(userA.id, userB.username);
    assert.equal(mutualProfile?.mutual, true);
    assert.equal(mutualProfile?.stats?.drillCount, 1);
    assert.equal(mutualProfile?.stats?.trainingMethods[0]?.id, method.id);

    const countsA = (await getConnectionsSummary(userA.id)).counts;
    assert.equal(countsA.followers, 1);
    assert.equal(countsA.following, 1);
    assert.equal(countsA.incoming, 0);
    assert.equal(countsA.outgoing, 0);
    assert.ok(await getAuthorizedConnectionPage(
      userA.id,
      userB.username,
      "followers",
      null,
    ));
    assert.equal(
      await getAuthorizedConnectionPage(userC.id, userB.username, "followers", null),
      null,
      "Non-reciprocal users must not open another fighter's lists.",
    );

    const candidateAcceptedAt = new Date();
    await db.insert(follows).values([
      {
        followerId: userB.id,
        followingId: userC.id,
        status: "accepted",
        respondedAt: candidateAcceptedAt,
      },
      {
        followerId: userC.id,
        followingId: userB.id,
        status: "accepted",
        respondedAt: candidateAcceptedAt,
      },
    ]);
    for (const section of ["followers", "following"] as const) {
      assert.ok(
        (await getAuthorizedConnectionPage(userA.id, userB.username, section, null))
          ?.items.some((item) => item.profile.id === userC.id),
        `The owner's ${section} page should initially include the candidate.`,
      );
    }

    await blockFighter(userC.id, userA.id);
    for (const section of ["followers", "following"] as const) {
      assert.equal(
        (await getAuthorizedConnectionPage(userA.id, userB.username, section, null))
          ?.items.some((item) => item.profile.id === userC.id),
        false,
        `A candidate who blocked the viewer must be hidden from the owner's ${section} page.`,
      );
    }
    await unblockFighter(userC.id, userA.id);

    await blockFighter(userA.id, userC.id);
    for (const section of ["followers", "following"] as const) {
      assert.equal(
        (await getAuthorizedConnectionPage(userA.id, userB.username, section, null))
          ?.items.some((item) => item.profile.id === userC.id),
        false,
        `A candidate blocked by the viewer must be hidden from the owner's ${section} page.`,
      );
    }
    await unblockFighter(userA.id, userC.id);

    const unsharedRecipientPage = await getDrillShareRecipientPage(
      userB.id,
      fighterDrill.id,
      null,
    );
    assert.equal(unsharedRecipientPage.items[0]?.profile.id, userA.id);
    assert.equal(unsharedRecipientPage.items[0]?.shared, false);
    await updateDrillShare(userB.id, fighterDrill.id, userA.id, true);
    assert.equal(
      (await getDrillShareRecipientPage(userB.id, fighterDrill.id, null)).items[0]?.shared,
      true,
      "The recipient snapshot must include the drill share flag.",
    );
    assert.equal(
      (await listSharedDrills(userA.id, null, userB.username)).items[0]?.drill.id,
      fighterDrill.id,
    );
    assert.equal((await getSharedDrillById(userA.id, fighterDrill.id))?.owner.id, userB.id);
    assert.equal(await getSharedDrillById(userC.id, fighterDrill.id), null);

    const paginationDrills = await db
      .insert(drills)
      .values(Array.from({ length: 11 }, (_, index) => ({
        userId: userB.id,
        title: `Shared drill page ${String(index + 1).padStart(2, "0")}`,
        summary: "",
      })))
      .returning({ id: drills.id });
    const sharedDrillIds = [fighterDrill.id, ...paginationDrills.map((drill) => drill.id)];
    await db.insert(drillShares).values(paginationDrills.map((drill) => ({
      drillId: drill.id,
      recipientUserId: userA.id,
    })));
    const sharedAtValues = [
      "2030-01-01T00:00:02.000009Z",
      "2030-01-01T00:00:02.000008Z",
      "2030-01-01T00:00:02.000007Z",
      "2030-01-01T00:00:02.000006Z",
      "2030-01-01T00:00:02.000005Z",
      "2030-01-01T00:00:02.000004Z",
      "2030-01-01T00:00:02.000003Z",
      "2030-01-01T00:00:02.000002Z",
      "2030-01-01T00:00:02.000001Z",
      "2030-01-01T00:00:01.000900Z",
      "2030-01-01T00:00:01.000800Z",
      "2030-01-01T00:00:01.000700Z",
    ];
    await Promise.all(sharedDrillIds.map((sharedDrillId, index) => db.execute(sql`
      update ${drillShares}
      set created_at = ${sharedAtValues[index]!}::timestamptz
      where ${drillShares.drillId} = ${sharedDrillId}
        and ${drillShares.recipientUserId} = ${userA.id}
    `)));
    assert.deepEqual(
      await collectSharedDrillPages(userA.id, userB.username, sharedAtValues[9]!),
      sharedDrillIds,
      "Shared drills must remain ordered and unique across a sub-millisecond cursor boundary.",
    );

    await cancelOrUnfollow(userA.id, userB.id);
    assert.equal((await loadPairRows(userA.id, userB.id)).length, 1);
    assert.equal(
      (await db.select().from(drillShares).where(eq(drillShares.drillId, fighterDrill.id))).length,
      0,
      "Losing reciprocal status must revoke pair shares.",
    );
    await assert.rejects(
      () => listSharedDrills(userA.id, null, userB.username),
      /Fighter not found\./,
      "Losing reciprocal status must also make the filtered shared-drill page unavailable.",
    );
    assert.equal(
      (await getFighterProfileByUsername(userA.id, userB.username))?.stats,
      null,
    );

    // Restore reciprocity through a fresh request and independent approval.
    await requestFollow(userA.id, userB.username);
    await respondToFollowRequest(userB.id, userA.id, { action: "accept" });
    await updateDrillShare(userB.id, fighterDrill.id, userA.id, true);
    await blockFighter(userA.id, userB.id);
    assert.equal((await loadPairRows(userA.id, userB.id)).length, 0);
    assert.equal(
      (await db.select().from(drillShares).where(eq(drillShares.drillId, fighterDrill.id))).length,
      0,
    );
    assert.equal(await findFighterByUsername(userA.id, userB.username), null);
    assert.equal(await findFighterByUsername(userB.id, userA.username), null);
    assert.equal(
      await getAuthorizedConnectionPage(userA.id, userB.username, "followers", null),
      null,
      "Blocked fighters must not retain access to connection lists.",
    );
    assert.equal(
      (await db.select().from(userBlocks).where(and(
        eq(userBlocks.blockerId, userA.id),
        eq(userBlocks.blockedId, userB.id),
      ))).length,
      1,
    );
    await unblockFighter(userA.id, userB.id);

    // Concurrent opposite requests both survive in the directed model.
    const crossedRace = await Promise.all([
      requestFollow(userA.id, userC.username),
      requestFollow(userC.id, userA.username),
    ]);
    assert.ok(crossedRace.every((result) => result.outgoing.status === "pending"));
    assert.equal((await loadPairRows(userA.id, userC.id)).length, 2);
    await respondToFollowRequest(userC.id, userA.id, { action: "decline" });
    await respondToFollowRequest(userA.id, userC.id, { action: "decline" });

    await Promise.allSettled([
      requestFollow(userA.id, userC.username),
      blockFighter(userC.id, userA.id),
    ]);
    assert.equal(
      (await loadPairRows(userA.id, userC.id)).length,
      0,
      "A concurrent block must leave no surviving follow direction.",
    );
    await unblockFighter(userC.id, userA.id);

    const report = await reportFighter(userC.id, userB.id, "spam", "Verification report.");
    assert.equal(report.reportedUserId, userB.id);
    assert.equal(
      (await db.select().from(friendReports).where(eq(friendReports.id, report.reportId))).length,
      1,
    );
    for (let index = 0; index < 4; index += 1) {
      await reportFighter(userC.id, userB.id, "spam", null);
    }
    await expectConnectionError(
      () => reportFighter(userC.id, userB.id, "spam", null),
      429,
    );

    const paginatedUsers = Array.from({ length: 52 }, (_, index) => (
      fixtureUser(`follow_page_${String(index).padStart(2, "0")}_${suffix}`)
    ));
    auxiliaryUserIds.push(...paginatedUsers.map((user) => user.id));
    await db.insert(users).values(paginatedUsers);
    const acceptedAt = new Date();
    await db.insert(follows).values(paginatedUsers.flatMap((user) => ([
      {
        followerId: userA.id,
        followingId: user.id,
        status: "accepted",
        respondedAt: acceptedAt,
      },
      {
        followerId: user.id,
        followingId: userA.id,
        status: "accepted",
        respondedAt: acceptedAt,
      },
    ])));
    const followerPages = await collectSectionPages(userA.id, "followers");
    const followingPages = await collectSectionPages(userA.id, "following");
    assert.equal(followerPages, 52);
    assert.equal(followingPages, 52);
    assert.equal(
      await collectAuthorizedSectionPages(userA.id, userA.username, "followers"),
      52,
      "Self-authorized follower pages must retain real cursor pagination.",
    );
    assert.equal(
      await collectAuthorizedSectionPages(userA.id, userA.username, "following"),
      52,
      "Self-authorized following pages must retain real cursor pagination.",
    );
    const [paginationDrill] = await db
      .insert(drills)
      .values({ userId: userA.id, title: "Share pagination drill", summary: "" })
      .returning({ id: drills.id });
    if (!paginationDrill) throw new Error("Could not create share pagination drill.");
    assert.deepEqual(
      await collectDrillShareRecipientPages(userA.id, paginationDrill.id),
      paginatedUsers.map((user) => user.id),
      "Share recipients must remain ordered and unique across real cursor pages.",
    );
    const paginatedCounts = (await getConnectionsSummary(userA.id)).counts;
    assert.equal(paginatedCounts.followers, 52);
    assert.equal(paginatedCounts.following, 52);

    const cappedUsers = Array.from({ length: 51 }, (_, index) => (
      fixtureUser(`follow_cap_${String(index).padStart(2, "0")}_${suffix}`)
    ));
    auxiliaryUserIds.push(...cappedUsers.map((user) => user.id));
    await db.insert(users).values(cappedUsers);
    assert.deepEqual(
      await getAuthorizedConnectionPage(
        cappedUsers[50]!.id,
        cappedUsers[50]!.username,
        "followers",
        null,
      ),
      {
        owner: {
          id: cappedUsers[50]!.id,
          username: cappedUsers[50]!.username,
          avatarUrl: null,
        },
        section: "followers",
        items: [],
        nextCursor: null,
      },
      "An empty self-authorized page must survive the lateral sentinel path.",
    );
    await db.insert(follows).values(cappedUsers.slice(0, 50).map((user) => ({
      followerId: userA.id,
      followingId: user.id,
    })));
    await expectConnectionError(
      () => requestFollow(userA.id, cappedUsers[50]!.username),
      409,
    );

    for (let index = 0; index < 30; index += 1) {
      await consumeConnectionRateLimit(userB.id, "search");
    }
    await expectConnectionError(
      () => consumeConnectionRateLimit(userB.id, "search"),
      429,
    );

    console.log(
      "Follow verification passed: directed requests, crossed requests, accepted-only counts, pagination, limits, private stats, privacy-filtered authorized lists, reciprocal sharing, revocation, blocking, and reports are isolated.",
    );
  } finally {
    await db.delete(users).where(inArray(users.id, [userA.id, userB.id, userC.id]));
    if (auxiliaryUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, auxiliaryUserIds));
    }
  }
}

async function collectSectionPages(
  userId: string,
  section: "followers" | "following",
) {
  let cursor: string | null = null;
  let total = 0;
  do {
    const page = await getConnectionSectionPage(userId, section, cursor, 20);
    total += page.items.length;
    cursor = page.nextCursor;
  } while (cursor);
  return total;
}

async function collectDrillShareRecipientPages(ownerUserId: string, drillId: string) {
  const recipientIds: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await getDrillShareRecipientPage(ownerUserId, drillId, cursor);
    assert.ok(
      page.items.every((item) => item.shared === false),
      "Fresh recipient pages must not report shares.",
    );
    recipientIds.push(...page.items.map((item) => item.profile.id));
    cursor = page.nextCursor;
  } while (cursor);
  return recipientIds;
}

async function collectAuthorizedSectionPages(
  viewerUserId: string,
  ownerUsername: string,
  section: "followers" | "following",
) {
  let cursor: string | null = null;
  let total = 0;
  do {
    const page = await getAuthorizedConnectionPage(
      viewerUserId,
      ownerUsername,
      section,
      cursor,
    );
    assert.ok(page, "The authorized owner must remain visible across cursor pages.");
    total += page.items.length;
    cursor = page.nextCursor;
  } while (cursor);
  return total;
}

async function collectSharedDrillPages(
  viewerUserId: string,
  ownerUsername: string,
  expectedFirstCursorSharedAt: string,
) {
  const drillIds: string[] = [];
  let cursor: string | null = null;
  let pageNumber = 0;
  do {
    const page = await listSharedDrills(viewerUserId, cursor, ownerUsername);
    drillIds.push(...page.items.map((item) => item.drill.id));
    cursor = page.nextCursor;
    pageNumber += 1;
    if (pageNumber === 1) {
      assert.ok(cursor, "Twelve shared drills must produce a second page.");
      const decodedCursor = JSON.parse(
        Buffer.from(cursor, "base64url").toString("utf8"),
      ) as { sharedAt?: unknown };
      assert.equal(
        decodedCursor.sharedAt,
        expectedFirstCursorSharedAt,
        "The shared-drill cursor must preserve PostgreSQL microsecond precision.",
      );
    }
  } while (cursor);
  assert.equal(pageNumber, 2, "Twelve shared drills must resolve in exactly two pages.");
  return drillIds;
}

function loadPairRows(firstUserId: string, secondUserId: string) {
  return db
    .select()
    .from(follows)
    .where(or(
      and(eq(follows.followerId, firstUserId), eq(follows.followingId, secondUserId)),
      and(eq(follows.followerId, secondUserId), eq(follows.followingId, firstUserId)),
    ));
}

async function expectConnectionError(
  operation: () => Promise<unknown>,
  status: number,
) {
  await assert.rejects(operation, (error) => (
    error instanceof ConnectionMutationError && error.status === status
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
