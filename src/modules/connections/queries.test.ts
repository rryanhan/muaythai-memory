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
  getConnectionsSummary,
  getFighterProfileByUsername,
} from "./queries";

const userId = "11111111-1111-4111-8111-111111111111";
const viewerId = "22222222-2222-4222-8222-222222222222";

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

  it("loads accepted public follower directions in one statement", async () => {
    mocks.execute
      .mockResolvedValueOnce([{
        id: userId,
        username: "target_fighter",
        avatarUrl: null,
        outgoingStatus: null,
        outgoingRequestedAt: null,
        outgoingAcceptedAt: null,
        incomingStatus: null,
        incomingRequestedAt: null,
        incomingAcceptedAt: null,
      }])
      .mockImplementationOnce(async (query) => {
        const compiled = new PgDialect().sqlToQuery(query);
        const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();

        expect(normalizedSql).toContain(
          `select count(*)::integer as "followers" from "follows" ` +
            `where "follows"."following_id" = $1 and "follows"."status" = 'accepted'`,
        );
        expect(normalizedSql).toContain(
          `select count(*)::integer as "following" from "follows" ` +
            `where "follows"."follower_id" = $2 and "follows"."status" = 'accepted'`,
        );
        expect(compiled.params).toEqual([userId, userId]);
        return [{ followers: 7, following: 9 }];
      });

    const fighter = await getFighterProfileByUsername(viewerId, "target_fighter");

    expect(fighter?.socialCounts).toEqual({ followers: 7, following: 9 });
    expect(fighter?.stats).toBeNull();
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
