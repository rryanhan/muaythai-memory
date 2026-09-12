import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { getDrillShareRecipientPage } from "./queries";

const ownerId = "11111111-1111-4111-8111-111111111111";
const drillId = "22222222-2222-4222-8222-222222222222";
const recipientId = "33333333-3333-4333-8333-333333333333";

describe("getDrillShareRecipientPage", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.select.mockReset();
  });

  it("loads the owned drill, reciprocal visible recipients, and share flags in one statement", async () => {
    const occurredAt = "2026-05-01T02:03:04.000Z";
    mocks.execute.mockImplementationOnce(async (query) => {
      const compiled = new PgDialect().sqlToQuery(query);
      const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();

      expect(normalizedSql).toContain(
        `with owned_drill as materialized ( select "drills"."id" as "id" ` +
          `from "drills" where "drills"."id" = $1 and "drills"."user_id" = $2 limit 1 )`,
      );
      expect(normalizedSql).toContain(`left join lateral (`);
      expect(normalizedSql).toContain(
        `"follows"."follower_id" = $3 and "follows"."status" = 'accepted'`,
      );
      expect(normalizedSql).toContain(
        `reverse_follow."follower_id" = "users"."id" ` +
          `and reverse_follow."following_id" = $4 ` +
          `and reverse_follow."status" = 'accepted'`,
      );
      expect(normalizedSql).toContain(`"users"."profile_onboarded_at" is not null`);
      expect(normalizedSql).toContain(
        `"user_blocks"."blocker_id" = $5 and "user_blocks"."blocked_id" = "users"."id"`,
      );
      expect(normalizedSql).toContain(
        `"user_blocks"."blocker_id" = "users"."id" and "user_blocks"."blocked_id" = $6`,
      );
      expect(normalizedSql).toContain(
        `"drill_shares"."drill_id" = owned_drill."id" ` +
          `and "drill_shares"."recipient_user_id" = "users"."id"`,
      );
      expect(normalizedSql).toContain(
        `order by "users"."username", "users"."id" limit 21`,
      );
      expect(compiled.params).toEqual([
        drillId,
        ownerId,
        ownerId,
        ownerId,
        ownerId,
        ownerId,
      ]);
      return [{
        ownedDrillId: drillId,
        recipientId,
        recipientUsername: "alpha_fighter",
        recipientAvatarUrl: null,
        occurredAt,
        shared: true,
      }];
    });

    await expect(getDrillShareRecipientPage(ownerId, drillId, null)).resolves.toEqual({
      items: [{
        profile: { id: recipientId, username: "alpha_fighter", avatarUrl: null },
        shared: true,
      }],
      nextCursor: null,
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns an empty page from the ownership sentinel row", async () => {
    mocks.execute.mockResolvedValueOnce([{
      ownedDrillId: drillId,
      recipientId: null,
      recipientUsername: null,
      recipientAvatarUrl: null,
      occurredAt: null,
      shared: null,
    }]);

    await expect(getDrillShareRecipientPage(ownerId, drillId, null)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("preserves the owned-drill 404 ahead of invalid cursor errors", async () => {
    mocks.execute.mockResolvedValueOnce([]);

    const result = getDrillShareRecipientPage(ownerId, drillId, "not-a-cursor");
    await expect(result).rejects.toMatchObject({
      message: "Drill not found.",
      status: 404,
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("rejects an invalid cursor after confirming ownership in the same statement", async () => {
    mocks.execute.mockResolvedValueOnce([{
      ownedDrillId: drillId,
      recipientId: null,
      recipientUsername: null,
      recipientAvatarUrl: null,
      occurredAt: null,
      shared: null,
    }]);

    await expect(getDrillShareRecipientPage(ownerId, drillId, "not-a-cursor")).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ["cursor"] })],
    });
    const compiled = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]![0]);
    expect(compiled.sql.replace(/\s+/g, " ")).toContain(`and false`);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("returns twenty items and encodes the last item as the next cursor", async () => {
    mocks.execute.mockResolvedValueOnce(Array.from({ length: 21 }, (_, index) => ({
      ownedDrillId: drillId,
      recipientId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      recipientUsername: `fighter_${String(index).padStart(2, "0")}`,
      recipientAvatarUrl: null,
      occurredAt: new Date("2026-05-01T00:00:00.000Z"),
      shared: index % 2 === 0,
    })));

    const page = await getDrillShareRecipientPage(ownerId, drillId, null);

    expect(page.items).toHaveLength(20);
    expect(page.items[0]?.shared).toBe(true);
    expect(page.items[19]?.shared).toBe(false);
    expect(JSON.parse(Buffer.from(page.nextCursor!, "base64url").toString("utf8"))).toEqual({
      username: "fighter_19",
      userId: "00000000-0000-4000-8000-000000000019",
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
});
