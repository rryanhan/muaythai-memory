import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { friendRateLimits } from "@/db/schema";
import { ConnectionMutationError } from "./errors";

export type ConnectionRateLimitAction = "search" | "follow" | "report";

const rateLimits: Record<
  ConnectionRateLimitAction,
  { limit: number; windowMs: number; message: string }
> = {
  search: {
    limit: 30,
    windowMs: 10 * 60 * 1000,
    message: "Too many fighter searches. Wait a few minutes and try again.",
  },
  follow: {
    limit: 20,
    windowMs: 24 * 60 * 60 * 1000,
    message: "Follow request limit reached. Try again tomorrow.",
  },
  report: {
    limit: 5,
    windowMs: 24 * 60 * 60 * 1000,
    message: "Report limit reached. Try again tomorrow.",
  },
};

export async function consumeConnectionRateLimit(
  userId: string,
  action: ConnectionRateLimitAction,
  executor: Pick<typeof db, "insert"> = db,
): Promise<void> {
  const policy = rateLimits[action];
  const now = new Date();
  const windowStart = new Date(
    Math.floor(now.getTime() / policy.windowMs) * policy.windowMs,
  );
  const rows = await executor
    .insert(friendRateLimits)
    .values({
      userId,
      action,
      windowStart,
      requestCount: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        friendRateLimits.userId,
        friendRateLimits.action,
        friendRateLimits.windowStart,
      ],
      set: {
        requestCount: sql`${friendRateLimits.requestCount} + 1`,
        updatedAt: now,
      },
      setWhere: sql`${friendRateLimits.requestCount} < ${policy.limit}`,
    })
    .returning({ requestCount: friendRateLimits.requestCount });

  if (!rows[0]) throw new ConnectionMutationError(policy.message, 429);
}
