import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionCounts } from "./contracts";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: {
    execute: mocks.execute,
    select: mocks.select,
  },
}));

import {
  findFighterByUsername,
  getAuthorizedConnectionPage,
  getConnectionsSummary,
  getFighterProfileByUsername,
} from "./queries";

const userId = "11111111-1111-4111-8111-111111111111";
const viewerId = "22222222-2222-4222-8222-222222222222";
const connectionId = "33333333-3333-4333-8333-333333333333";

describe("findFighterByUsername", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.select.mockReset();
  });

  it("loads the visible onboarded profile and both follow directions in one statement", async () => {
    const outgoingRequestedAt = "2026-01-02T03:04:05.000Z";
    const incomingRequestedAt = new Date("2026-02-03T04:05:06.000Z");
    const incomingAcceptedAt = "2026-02-04T05:06:07.000Z";

    mocks.execute.mockImplementationOnce(async (query) => {
      const compiled = new PgDialect().sqlToQuery(query);
      const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();

      expect(normalizedSql).toContain(
        `inner join "users" on "users"."username" = request_context."username" ` +
          `and "users"."profile_onboarded_at" is not null`,
      );
      expect(normalizedSql).toContain(
        `left join "follows" as outgoing_follow ` +
          `on outgoing_follow."follower_id" = request_context."viewerId" ` +
          `and outgoing_follow."following_id" = "users"."id"`,
      );
      expect(normalizedSql).toContain(
        `left join "follows" as incoming_follow ` +
          `on incoming_follow."follower_id" = "users"."id" ` +
          `and incoming_follow."following_id" = request_context."viewerId"`,
      );
      expect(normalizedSql).toContain(
        `where "users"."id" = request_context."viewerId" or not exists ( ` +
          `select 1 from "user_blocks" as pair_block`,
      );
      expect(normalizedSql).toContain(
        `pair_block."blocker_id" = request_context."viewerId" ` +
          `and pair_block."blocked_id" = "users"."id"`,
      );
      expect(normalizedSql).toContain(
        `pair_block."blocker_id" = "users"."id" ` +
          `and pair_block."blocked_id" = request_context."viewerId"`,
      );
      expect(normalizedSql).toContain(
        `coalesce(outgoing_follow."responded_at", outgoing_follow."updated_at")`,
      );
      expect(normalizedSql).toContain(
        `coalesce(incoming_follow."responded_at", incoming_follow."updated_at")`,
      );
      expect(compiled.params).toEqual([viewerId, "target_fighter"]);

      return [{
        id: userId,
        username: "target_fighter",
        avatarUrl: null,
        outgoingStatus: "pending",
        outgoingRequestedAt,
        outgoingAcceptedAt: null,
        incomingStatus: "accepted",
        incomingRequestedAt,
        incomingAcceptedAt,
      }];
    });

    await expect(findFighterByUsername(viewerId, "target_fighter")).resolves.toEqual({
      profile: { id: userId, username: "target_fighter", avatarUrl: null },
      isSelf: false,
      blockedByViewer: false,
      outgoing: {
        status: "pending",
        requestedAt: new Date(outgoingRequestedAt),
        acceptedAt: null,
      },
      incoming: {
        status: "accepted",
        requestedAt: incomingRequestedAt,
        acceptedAt: new Date(incomingAcceptedAt),
      },
      mutual: false,
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("maps independently accepted directions to a mutual connection", async () => {
    const outgoingRequestedAt = new Date("2026-03-01T00:00:00.000Z");
    const outgoingAcceptedAt = new Date("2026-03-02T00:00:00.000Z");
    const incomingRequestedAt = new Date("2026-03-03T00:00:00.000Z");
    const incomingAcceptedAt = new Date("2026-03-04T00:00:00.000Z");
    mocks.execute.mockResolvedValueOnce([{
      id: userId,
      username: "target_fighter",
      avatarUrl: "https://example.com/avatar.png",
      outgoingStatus: "accepted",
      outgoingRequestedAt,
      outgoingAcceptedAt,
      incomingStatus: "accepted",
      incomingRequestedAt,
      incomingAcceptedAt,
    }]);

    const result = await findFighterByUsername(viewerId, "target_fighter");

    expect(result?.outgoing).toEqual({
      status: "accepted",
      requestedAt: outgoingRequestedAt,
      acceptedAt: outgoingAcceptedAt,
    });
    expect(result?.incoming).toEqual({
      status: "accepted",
      requestedAt: incomingRequestedAt,
      acceptedAt: incomingAcceptedAt,
    });
    expect(result?.mutual).toBe(true);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("returns the self profile without exposing follow directions", async () => {
    mocks.execute.mockResolvedValueOnce([{
      id: viewerId,
      username: "viewer_fighter",
      avatarUrl: null,
      outgoingStatus: null,
      outgoingRequestedAt: null,
      outgoingAcceptedAt: null,
      incomingStatus: null,
      incomingRequestedAt: null,
      incomingAcceptedAt: null,
    }]);

    await expect(findFighterByUsername(viewerId, "viewer_fighter")).resolves.toEqual({
      profile: { id: viewerId, username: "viewer_fighter", avatarUrl: null },
      isSelf: true,
      blockedByViewer: false,
      outgoing: { status: "none", requestedAt: null, acceptedAt: null },
      incoming: { status: "none", requestedAt: null, acceptedAt: null },
      mutual: false,
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("returns null when no visible onboarded profile survives the statement", async () => {
    mocks.execute.mockResolvedValueOnce([]);

    await expect(findFighterByUsername(viewerId, "missing_fighter")).resolves.toBeNull();
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});

describe("getAuthorizedConnectionPage", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.select.mockReset();
  });

  it("authorizes the owner and loads a privacy-filtered follower page in one statement", async () => {
    const occurredAt = "2026-05-01T02:03:04.000Z";
    mocks.execute.mockImplementationOnce(async (query) => {
      const compiled = new PgDialect().sqlToQuery(query);
      const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();

      expect(normalizedSql).toContain(`authorized_owner as materialized (`);
      expect(normalizedSql).toContain(
        `inner join "users" on "users"."username" = request_context."ownerUsername" ` +
          `and "users"."profile_onboarded_at" is not null`,
      );
      expect(normalizedSql).toContain(
        `where "users"."id" = request_context."viewerId" or (`,
      );
      expect(normalizedSql).toContain(
        `owner_block."blocker_id" = request_context."viewerId" ` +
          `and owner_block."blocked_id" = "users"."id"`,
      );
      expect(normalizedSql).toContain(
        `owner_block."blocker_id" = "users"."id" ` +
          `and owner_block."blocked_id" = request_context."viewerId"`,
      );
      expect(normalizedSql).toContain(
        `viewer_follow."follower_id" = request_context."viewerId" ` +
          `and viewer_follow."following_id" = "users"."id" ` +
          `and viewer_follow."status" = 'accepted'`,
      );
      expect(normalizedSql).toContain(
        `owner_follow."follower_id" = "users"."id" ` +
          `and owner_follow."following_id" = request_context."viewerId" ` +
          `and owner_follow."status" = 'accepted'`,
      );
      expect(normalizedSql).toContain(`left join lateral (`);
      expect(normalizedSql).toContain(
        `inner join "users" on "users"."id" = "follows"."follower_id" ` +
          `where "follows"."following_id" = authorized_owner."id" ` +
          `and "follows"."status" = 'accepted'`,
      );
      expect(normalizedSql).toContain(
        `connection_block."blocker_id" = authorized_owner."id" ` +
          `and connection_block."blocked_id" = "users"."id"`,
      );
      expect(normalizedSql).toContain(
        `connection_block."blocker_id" = "users"."id" ` +
          `and connection_block."blocked_id" = authorized_owner."id"`,
      );
      expect(normalizedSql).toContain(
        `connection_block."blocker_id" = authorized_owner."viewerId" ` +
          `and connection_block."blocked_id" = "users"."id"`,
      );
      expect(normalizedSql).toContain(
        `connection_block."blocker_id" = "users"."id" ` +
          `and connection_block."blocked_id" = authorized_owner."viewerId"`,
      );
      expect(normalizedSql).toContain(
        `order by "users"."username", "users"."id" limit $3`,
      );
      expect(compiled.params).toEqual([viewerId, "target_fighter", 21]);

      return [{
        ownerId: userId,
        ownerUsername: "target_fighter",
        ownerAvatarUrl: null,
        connectionId,
        connectionUsername: "connected_fighter",
        connectionAvatarUrl: "https://example.com/connected.png",
        occurredAt,
      }];
    });

    await expect(
      getAuthorizedConnectionPage(viewerId, "target_fighter", "followers", null),
    ).resolves.toEqual({
      owner: { id: userId, username: "target_fighter", avatarUrl: null },
      section: "followers",
      items: [{
        profile: {
          id: connectionId,
          username: "connected_fighter",
          avatarUrl: "https://example.com/connected.png",
        },
        occurredAt: new Date(occurredAt),
      }],
      nextCursor: null,
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("uses the outgoing relationship direction for following pages", async () => {
    mocks.execute.mockResolvedValueOnce([authorizedConnectionSentinel()]);

    await getAuthorizedConnectionPage(viewerId, "target_fighter", "following", null);

    const compiled = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]![0]);
    const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();
    expect(normalizedSql).toContain(
      `inner join "users" on "users"."id" = "follows"."following_id" ` +
        `where "follows"."follower_id" = authorized_owner."id"`,
    );
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("returns an empty page from an authorized-owner sentinel row", async () => {
    mocks.execute.mockResolvedValueOnce([authorizedConnectionSentinel()]);

    await expect(
      getAuthorizedConnectionPage(viewerId, "target_fighter", "followers", null),
    ).resolves.toEqual({
      owner: { id: userId, username: "target_fighter", avatarUrl: null },
      section: "followers",
      items: [],
      nextCursor: null,
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("returns null for an inaccessible owner before reporting an invalid cursor", async () => {
    mocks.execute.mockResolvedValueOnce([]);

    await expect(
      getAuthorizedConnectionPage(viewerId, "hidden_fighter", "followers", "not-a-cursor"),
    ).resolves.toBeNull();
    const compiled = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]![0]);
    expect(compiled.sql.replace(/\s+/g, " ")).toContain(`and false`);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("reports an invalid cursor after confirming access in the same statement", async () => {
    mocks.execute.mockResolvedValueOnce([authorizedConnectionSentinel()]);

    await expect(
      getAuthorizedConnectionPage(viewerId, "target_fighter", "followers", "not-a-cursor"),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ["cursor"] })],
    });
    const compiled = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]![0]);
    expect(compiled.sql.replace(/\s+/g, " ")).toContain(`and false`);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("applies a valid cursor within the lateral page query", async () => {
    const cursor = Buffer.from(JSON.stringify({
      username: "after_fighter",
      userId: connectionId,
    })).toString("base64url");
    mocks.execute.mockResolvedValueOnce([authorizedConnectionSentinel()]);

    await getAuthorizedConnectionPage(
      viewerId,
      "target_fighter",
      "followers",
      cursor,
    );

    const compiled = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]![0]);
    const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();
    expect(normalizedSql).toContain(
      `and ( "users"."username" > $3 ` +
        `or ("users"."username" = $4 and "users"."id" > $5) )`,
    );
    expect(compiled.params).toEqual([
      viewerId,
      "target_fighter",
      "after_fighter",
      "after_fighter",
      connectionId,
      21,
    ]);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("returns the requested page size and encodes its final row as the next cursor", async () => {
    mocks.execute.mockResolvedValueOnce(Array.from({ length: 21 }, (_, index) => ({
      ownerId: userId,
      ownerUsername: "target_fighter",
      ownerAvatarUrl: null,
      connectionId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      connectionUsername: `fighter_${String(index).padStart(2, "0")}`,
      connectionAvatarUrl: null,
      occurredAt: new Date("2026-05-01T00:00:00.000Z"),
    })));

    const page = await getAuthorizedConnectionPage(
      viewerId,
      "target_fighter",
      "followers",
      null,
    );

    expect(page?.items).toHaveLength(20);
    expect(JSON.parse(Buffer.from(page!.nextCursor!, "base64url").toString("utf8"))).toEqual({
      username: "fighter_19",
      userId: "00000000-0000-4000-8000-000000000019",
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
});

describe("connection count queries", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.select.mockReset();
  });

  it("loads every direction, status, and blocked count in one statement", async () => {
    const expected: ConnectionCounts = {
      followers: 11,
      following: 12,
      incoming: 13,
      outgoing: 14,
      blocked: 15,
    };

    mocks.execute.mockImplementationOnce(async (query) => {
      const compiled = new PgDialect().sqlToQuery(query);
      const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();

      expect(normalizedSql).toContain(
        `count(*) filter (where "follows"."status" = 'accepted')::integer as "followers", ` +
          `count(*) filter (where "follows"."status" = 'pending')::integer as "incoming" ` +
          `from "follows" where "follows"."following_id" = $1`,
      );
      expect(normalizedSql).toContain(
        `count(*) filter (where "follows"."status" = 'accepted')::integer as "following", ` +
          `count(*) filter (where "follows"."status" = 'pending')::integer as "outgoing" ` +
          `from "follows" where "follows"."follower_id" = $2`,
      );
      expect(normalizedSql).toContain(
        `select count(*)::integer as "blocked" from "user_blocks" ` +
          `where "user_blocks"."blocker_id" = $3`,
      );
      expect(compiled.params).toEqual([userId, userId, userId]);
      return [expected];
    });

    await expect(getConnectionsSummary(userId)).resolves.toEqual({ counts: expected });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("loads visibility, social counts, and gated stats in one statement", async () => {
    mocks.execute.mockImplementationOnce(async (query) => {
      const compiled = new PgDialect().sqlToQuery(query);
      const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();

      expect(normalizedSql).toContain(`with request_context as (`);
      expect(normalizedSql).toContain(`visible_fighter as materialized (`);
      expect(normalizedSql).toContain(
        `"users"."profile_onboarded_at" is not null`,
      );
      expect(normalizedSql).toContain(
        `pair_block."blocker_id" = request_context."viewerId" ` +
          `and pair_block."blocked_id" = "users"."id"`,
      );
      expect(normalizedSql).toContain(
        `pair_block."blocker_id" = "users"."id" ` +
          `and pair_block."blocked_id" = request_context."viewerId"`,
      );
      expect(normalizedSql).toContain(
        `outgoing_follow."status" = 'accepted' ` +
          `and incoming_follow."status" = 'accepted'`,
      );
      expect(normalizedSql).toContain(
        `where "follows"."following_id" = visible_fighter."id" ` +
          `and "follows"."status" = 'accepted'`,
      );
      expect(normalizedSql).toContain(
        `where "follows"."follower_id" = visible_fighter."id" ` +
          `and "follows"."status" = 'accepted'`,
      );
      expect(normalizedSql).toContain(
        `left join lateral ( select`,
      );
      expect(normalizedSql).toContain(
        `) as private_stats on visible_fighter."canViewConnections"`,
      );
      expect(normalizedSql).toContain(
        `and "training_methods"."active" = true`,
      );
      expect(compiled.params).toEqual([viewerId, "target_fighter"]);

      return [{
        id: userId,
        username: "target_fighter",
        avatarUrl: null,
        outgoingStatus: null,
        outgoingRequestedAt: null,
        outgoingAcceptedAt: null,
        incomingStatus: null,
        incomingRequestedAt: null,
        incomingAcceptedAt: null,
        canViewConnections: false,
        followers: 7,
        following: 9,
        drillCount: null,
        trainingMethods: null,
      }];
    });

    const fighter = await getFighterProfileByUsername(viewerId, "target_fighter");

    expect(fighter?.socialCounts).toEqual({ followers: 7, following: 9 });
    expect(fighter?.stats).toBeNull();
    expect(fighter?.canViewConnections).toBe(false);
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("maps mutual directions and authorized private training stats", async () => {
    const requestedAt = new Date("2026-04-01T00:00:00.000Z");
    const acceptedAt = new Date("2026-04-02T00:00:00.000Z");
    mocks.execute.mockResolvedValueOnce([{
      id: userId,
      username: "target_fighter",
      avatarUrl: null,
      outgoingStatus: "accepted",
      outgoingRequestedAt: requestedAt,
      outgoingAcceptedAt: acceptedAt,
      incomingStatus: "accepted",
      incomingRequestedAt: requestedAt,
      incomingAcceptedAt: acceptedAt,
      canViewConnections: true,
      followers: 4,
      following: 5,
      drillCount: 6,
      trainingMethods: [{
        id: "33333333-3333-4333-8333-333333333333",
        name: "Pad Work",
        slug: "pad-work",
        iconKey: "pads",
        count: 3,
      }],
    }]);

    const fighter = await getFighterProfileByUsername(viewerId, "target_fighter");

    expect(fighter).toMatchObject({
      mutual: true,
      canViewConnections: true,
      socialCounts: { followers: 4, following: 5 },
      stats: {
        drillCount: 6,
        trainingMethods: [{ name: "Pad Work", count: 3 }],
      },
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("allows self access while keeping follow directions hidden", async () => {
    mocks.execute.mockResolvedValueOnce([{
      id: viewerId,
      username: "viewer_fighter",
      avatarUrl: null,
      outgoingStatus: "accepted",
      outgoingRequestedAt: new Date(),
      outgoingAcceptedAt: new Date(),
      incomingStatus: "accepted",
      incomingRequestedAt: new Date(),
      incomingAcceptedAt: new Date(),
      canViewConnections: true,
      followers: 1,
      following: 2,
      drillCount: 0,
      trainingMethods: [],
    }]);

    await expect(getFighterProfileByUsername(viewerId, "viewer_fighter")).resolves.toMatchObject({
      isSelf: true,
      mutual: false,
      outgoing: { status: "none" },
      incoming: { status: "none" },
      canViewConnections: true,
      stats: { drillCount: 0, trainingMethods: [] },
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("does not expose private fields unless mapped follow directions are mutual", async () => {
    mocks.execute.mockResolvedValueOnce([{
      id: userId,
      username: "target_fighter",
      avatarUrl: null,
      outgoingStatus: "accepted",
      outgoingRequestedAt: new Date(),
      outgoingAcceptedAt: new Date(),
      incomingStatus: "pending",
      incomingRequestedAt: new Date(),
      incomingAcceptedAt: null,
      canViewConnections: true,
      followers: 1,
      following: 2,
      drillCount: 99,
      trainingMethods: [{
        id: "33333333-3333-4333-8333-333333333333",
        name: "Private",
        slug: "private",
        iconKey: null,
        count: 99,
      }],
    }]);

    const fighter = await getFighterProfileByUsername(viewerId, "target_fighter");

    expect(fighter?.mutual).toBe(false);
    expect(fighter?.canViewConnections).toBe(false);
    expect(fighter?.stats).toBeNull();
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("returns null in one statement when the profile is absent, unonboarded, or blocked", async () => {
    mocks.execute.mockResolvedValueOnce([]);

    await expect(getFighterProfileByUsername(viewerId, "hidden_fighter")).resolves.toBeNull();
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});

function authorizedConnectionSentinel() {
  return {
    ownerId: userId,
    ownerUsername: "target_fighter",
    ownerAvatarUrl: null,
    connectionId: null,
    connectionUsername: null,
    connectionAvatarUrl: null,
    occurredAt: null,
  };
}
