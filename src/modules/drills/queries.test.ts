import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  db: { select: mocks.select },
}));

import { getOwnedDrillHeader } from "./queries";

const userId = "11111111-1111-4111-8111-111111111111";
const drillId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  mocks.select.mockReset();
});

describe("getOwnedDrillHeader", () => {
  it("loads only the owned drill identity in one query", async () => {
    let whereQuery: unknown;
    const builder = queryReturning([{ id: drillId, title: "Rear round kick" }], (query) => {
      whereQuery = query;
    });
    mocks.select.mockReturnValueOnce(builder);

    await expect(getOwnedDrillHeader(userId, drillId)).resolves.toEqual({
      id: drillId,
      title: "Rear round kick",
    });

    expect(mocks.select).toHaveBeenCalledOnce();
    expect(mocks.select).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.anything(),
      title: expect.anything(),
    }));
    const compiled = new PgDialect().sqlToQuery(whereQuery as never);
    expect(compiled.sql.replace(/\s+/g, " ").trim()).toBe(
      '("drills"."id" = $1 and "drills"."user_id" = $2)',
    );
    expect(compiled.params).toEqual([drillId, userId]);
  });

  it("returns null when the owned drill does not exist", async () => {
    mocks.select.mockReturnValueOnce(queryReturning([]));

    await expect(getOwnedDrillHeader(userId, drillId)).resolves.toBeNull();
  });
});

function queryReturning(rows: unknown[], captureWhere: (query: unknown) => void = () => undefined) {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  builder.from.mockReturnValue(builder);
  builder.where.mockImplementation((query) => {
    captureWhere(query);
    return builder;
  });
  builder.limit.mockResolvedValue(rows);
  return builder;
}
