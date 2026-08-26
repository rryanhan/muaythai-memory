import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  CaptureRateLimitError,
  consumeCaptureRateLimit,
} from "./rate-limits";

const databaseUrl = process.env.JOURNAL_TEST_DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;
const userId = "60000000-0000-4000-8000-000000000001";

let connectionA: Sql;
let connectionB: Sql;
let databaseA: ReturnType<typeof drizzle<typeof schema>>;
let databaseB: ReturnType<typeof drizzle<typeof schema>>;

describePostgres("capture rate limits with PostgreSQL", () => {
  beforeAll(async () => {
    assertLoopbackTestDatabase(databaseUrl!);
    connectionA = postgres(databaseUrl!, { max: 1, prepare: false });
    connectionB = postgres(databaseUrl!, { max: 1, prepare: false });
    databaseA = drizzle(connectionA, { schema });
    databaseB = drizzle(connectionB, { schema });
  });

  beforeEach(async () => {
    await connectionA`delete from capture_rate_limits where user_id = ${userId}`;
    await connectionA`delete from users where id = ${userId}`;
    await connectionA`
      insert into users (id, display_name)
      values (${userId}, 'Capture quota fixture')
    `;
  });

  afterAll(async () => {
    if (!connectionA || !connectionB) return;
    await connectionA`delete from users where id = ${userId}`;
    await Promise.all([connectionA.end(), connectionB.end()]);
  });

  it("allows only five concurrent attempts and rolls back the rejected daily increment", async () => {
    const now = new Date("2026-08-10T12:01:00.000Z");
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) => consumeCaptureRateLimit(
        userId,
        "transcription",
        { now, database: index % 2 === 0 ? databaseA : databaseB },
      )),
    );

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(5);
    const rejected = attempts.filter((attempt) => attempt.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: expect.any(CaptureRateLimitError),
    });

    const counts = await connectionA<{
      request_count: number;
      window_kind: string;
    }[]>`
      select window_kind, request_count
      from capture_rate_limits
      where user_id = ${userId}
        and action = 'transcription'
      order by window_kind
    `;
    expect(counts).toEqual([
      { request_count: 5, window_kind: "burst" },
      { request_count: 5, window_kind: "daily" },
    ]);
  });

  it("resets the burst window while retaining the daily count", async () => {
    const firstWindow = new Date("2026-08-10T12:01:00.000Z");
    await Promise.all(Array.from({ length: 5 }, () => consumeCaptureRateLimit(
      userId,
      "cleanup",
      { now: firstWindow, database: databaseA },
    )));
    await expect(consumeCaptureRateLimit(
      userId,
      "cleanup",
      { now: new Date("2026-08-10T12:10:00.000Z"), database: databaseA },
    )).resolves.toBeUndefined();

    const [daily] = await connectionA<{ request_count: number }[]>`
      select request_count
      from capture_rate_limits
      where user_id = ${userId}
        and action = 'cleanup'
        and window_kind = 'daily'
    `;
    expect(daily.request_count).toBe(6);
  });

  it("enforces independent 20/40 UTC daily ceilings", async () => {
    const dayStart = Date.parse("2026-08-10T00:01:00.000Z");

    for (let index = 0; index < 20; index += 1) {
      await consumeCaptureRateLimit(userId, "transcription", {
        now: new Date(dayStart + index * 11 * 60_000),
        database: databaseA,
      });
    }
    await expect(consumeCaptureRateLimit(userId, "transcription", {
      now: new Date(dayStart + 20 * 11 * 60_000),
      database: databaseA,
    })).rejects.toMatchObject({ windowKind: "daily" });

    for (let index = 0; index < 40; index += 1) {
      await consumeCaptureRateLimit(userId, "cleanup", {
        now: new Date(dayStart + index * 11 * 60_000),
        database: databaseA,
      });
    }
    await expect(consumeCaptureRateLimit(userId, "cleanup", {
      now: new Date(dayStart + 40 * 11 * 60_000),
      database: databaseA,
    })).rejects.toMatchObject({ windowKind: "daily" });
  });
});

function assertLoopbackTestDatabase(value: string): void {
  const url = new URL(value);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  if (!loopback || !url.pathname.includes("muaythai_pr6_test")) {
    throw new Error(
      "JOURNAL_TEST_DATABASE_URL must target a loopback database whose name contains muaythai_pr6_test.",
    );
  }
}
