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

import { getDrillShareRecipientPage, listSharedDrills } from "./queries";

const ownerId = "11111111-1111-4111-8111-111111111111";
const drillId = "22222222-2222-4222-8222-222222222222";
const recipientId = "33333333-3333-4333-8333-333333333333";
const viewerId = "44444444-4444-4444-8444-444444444444";

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

describe("listSharedDrills", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.select.mockReset();
  });

  it("authorizes an owner and hydrates the page relations in one statement", async () => {
    const row = sharedDrillRow(0, {
      drillCreatedAt: "2026-05-01T01:00:00.000Z",
      drillUpdatedAt: "2026-05-02T02:00:00.000Z",
      sharedAt: "2026-05-03T03:00:00.000Z",
      trainingMethods: [{
        id: "55555555-5555-4555-8555-555555555555",
        name: "Pad work",
        slug: "pad-work",
        iconKey: "pad-work",
        sortOrder: 1,
      }],
      tags: [{
        id: "66666666-6666-4666-8666-666666666666",
        name: "Round kick",
        slug: "round-kick",
        kind: "standard" as const,
        sortOrder: 1,
        category: null,
      }],
      customTags: [{
        id: "77777777-7777-4777-8777-777777777777",
        name: "Stay tall",
        slug: "stay-tall",
        kind: "custom" as const,
        sortOrder: 2,
        category: null,
      }],
    });
    mocks.execute.mockImplementationOnce(async (query) => {
      const compiled = new PgDialect().sqlToQuery(query);
      const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();

      expect(compiled.params).toEqual([viewerId, "owner_name", null, null]);
      expect(normalizedSql).toContain("with request_context as (");
      expect(normalizedSql).toContain("authorized_owner as materialized (");
      expect(normalizedSql).toContain("shared_page as materialized (");
      expect(normalizedSql).toContain(
        `"users"."profile_onboarded_at" is not null`,
      );
      expect(normalizedSql).toContain(
        `from "follows" as viewer_follow where viewer_follow."follower_id" = ` +
          `request_context."viewerId"`,
      );
      expect(normalizedSql).toContain(
        `viewer_follow."following_id" = "drills"."user_id" ` +
          `and viewer_follow."status" = 'accepted'`,
      );
      expect(normalizedSql).toContain(
        `from "follows" as owner_follow where owner_follow."follower_id" = ` +
          `"drills"."user_id"`,
      );
      expect(normalizedSql).toContain(
        `from "user_blocks" as pair_block where ( ` +
          `pair_block."blocker_id" = request_context."viewerId"`,
      );
      expect(normalizedSql).toContain(
        `pair_block."blocker_id" = "drills"."user_id" ` +
          `and pair_block."blocked_id" = request_context."viewerId"`,
      );
      expect(normalizedSql).toContain(
        `order by "drill_shares"."created_at" desc, "drill_shares"."drill_id" desc limit 11`,
      );
      expect(normalizedSql).toContain(
        `to_char( "drill_shares"."created_at" at time zone 'UTC', ` +
          `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"' ) as "sharedAtCursor"`,
      );
      expect(normalizedSql).toContain(`join "drill_training_methods"`);
      expect(normalizedSql).toContain(`join "drill_tags"`);
      expect(normalizedSql).toContain(
        `("tags"."user_id" is null or "tags"."user_id" = shared_page."ownerId")`,
      );
      expect(normalizedSql).not.toContain(`"drill_status_tags"`);
      expect(normalizedSql).not.toContain(`"status_tags"`);
      expect(normalizedSql).toContain(
        `from request_context left join authorized_owner on true ` +
          `left join shared_page on true`,
      );
      return [row];
    });

    await expect(listSharedDrills(viewerId, null, "owner_name")).resolves.toEqual({
      items: [{
        drill: {
          id: row.drillId,
          title: row.drillTitle,
          summary: row.drillSummary,
          trainingMethods: row.trainingMethods,
          tags: row.tags,
          customTags: row.customTags,
          statusTags: [],
          createdAt: new Date("2026-05-01T01:00:00.000Z"),
          updatedAt: new Date("2026-05-02T02:00:00.000Z"),
        },
        owner: {
          id: ownerId,
          username: "owner_name",
          avatarUrl: null,
        },
        sharedAt: new Date("2026-05-03T03:00:00.000Z"),
      }],
      nextCursor: null,
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("distinguishes an authorized owner with no shares from a hidden owner", async () => {
    mocks.execute.mockResolvedValueOnce([sharedDrillSentinel(true)]);

    await expect(listSharedDrills(viewerId, null, "owner_name")).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(mocks.execute).toHaveBeenCalledOnce();

    mocks.execute.mockResolvedValueOnce([sharedDrillSentinel(false)]);
    await expect(listSharedDrills(viewerId, null, "owner_name")).rejects.toMatchObject({
      message: "Fighter not found.",
      status: 404,
    });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it("returns an empty unfiltered page from the request-context sentinel", async () => {
    mocks.execute.mockResolvedValueOnce([sharedDrillSentinel(true)]);

    await expect(listSharedDrills(viewerId, null)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("returns ten rows and encodes row ten as the next descending cursor", async () => {
    const inputCursorSharedAt = "2026-04-30T00:00:00.123456Z";
    const cursor = Buffer.from(JSON.stringify({
      sharedAt: inputCursorSharedAt,
      drillId,
    })).toString("base64url");
    const fullPrecisionSharedAt = "2026-05-03T03:00:00.123456Z";
    const sharedAt = new Date(fullPrecisionSharedAt);
    const rows = Array.from({ length: 11 }, (_, index) => sharedDrillRow(index, {
      sharedAt,
      sharedAtCursor: fullPrecisionSharedAt,
    }));
    mocks.execute.mockResolvedValueOnce(rows);

    const page = await listSharedDrills(viewerId, cursor);

    expect(page.items).toHaveLength(10);
    expect(page.items.map((item) => item.drill.id)).toEqual(
      rows.slice(0, 10).map((row) => row.drillId),
    );
    expect(JSON.parse(Buffer.from(page.nextCursor!, "base64url").toString("utf8"))).toEqual({
      sharedAt: fullPrecisionSharedAt,
      drillId: rows[9]!.drillId,
    });
    const compiled = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]![0]);
    expect(compiled.params).toEqual([
      viewerId,
      null,
      inputCursorSharedAt,
      drillId,
    ]);
    expect(compiled.sql.replace(/\s+/g, " ")).toContain(
      `"drill_shares"."created_at" = request_context."cursorSharedAt" ` +
        `and "drill_shares"."drill_id" < request_context."cursorDrillId"`,
    );
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("rejects an invalid cursor before issuing a database statement", async () => {
    await expect(listSharedDrills(viewerId, "not-a-cursor")).rejects.toMatchObject({
      issues: [expect.objectContaining({ message: "Invalid shared-drill cursor." })],
    });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});

function sharedDrillRow(index: number, overrides: Record<string, unknown> = {}) {
  return {
    ownerAuthorized: true,
    drillId: `80000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    drillTitle: `Shared drill ${index}`,
    drillSummary: `Summary ${index}`,
    trainingMethods: [],
    tags: [],
    customTags: [],
    drillCreatedAt: new Date("2026-05-01T00:00:00.000Z"),
    drillUpdatedAt: new Date("2026-05-02T00:00:00.000Z"),
    ownerId,
    ownerUsername: "owner_name",
    ownerAvatarUrl: null,
    sharedAt: new Date("2026-05-03T00:00:00.000Z"),
    sharedAtCursor: "2026-05-03T00:00:00.000000Z",
    ...overrides,
  };
}

function sharedDrillSentinel(ownerAuthorized: boolean) {
  return {
    ownerAuthorized,
    drillId: null,
    drillTitle: null,
    drillSummary: null,
    trainingMethods: [],
    tags: [],
    customTags: [],
    drillCreatedAt: null,
    drillUpdatedAt: null,
    ownerId: null,
    ownerUsername: null,
    ownerAvatarUrl: null,
    sharedAt: null,
    sharedAtCursor: null,
  };
}
