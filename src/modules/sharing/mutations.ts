import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  drillShares,
  drills,
  follows,
  userBlocks,
  users,
} from "@/db/schema";
import type { UpdateDrillShareResponse } from "./contracts";
import { DrillShareError } from "./errors";

export async function updateDrillShare(
  ownerUserId: string,
  drillId: string,
  recipientUserId: string,
  shared: boolean,
): Promise<UpdateDrillShareResponse> {
  if (ownerUserId === recipientUserId) {
    throw new DrillShareError("A drill cannot be shared with its owner.", 400);
  }

  return db.transaction(async (tx) => {
    const [drill] = await tx
      .select({ id: drills.id })
      .from(drills)
      .where(and(eq(drills.id, drillId), eq(drills.userId, ownerUserId)))
      .for("update")
      .limit(1);
    if (!drill) throw new DrillShareError("Drill not found.", 404);

    if (!shared) {
      await tx
        .delete(drillShares)
        .where(and(
          eq(drillShares.drillId, drillId),
          eq(drillShares.recipientUserId, recipientUserId),
        ));
      return { drillId, recipientUserId, shared: false };
    }

    const pairUsers = await tx
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, [ownerUserId, recipientUserId]))
      .orderBy(asc(users.id))
      .for("share");
    const [block] = await tx
      .select({ blockerId: userBlocks.blockerId })
      .from(userBlocks)
      .where(or(
        and(
          eq(userBlocks.blockerId, ownerUserId),
          eq(userBlocks.blockedId, recipientUserId),
        ),
        and(
          eq(userBlocks.blockerId, recipientUserId),
          eq(userBlocks.blockedId, ownerUserId),
        ),
      ))
      .limit(1);
    const reciprocalRows = await tx
      .select({ followerId: follows.followerId })
      .from(follows)
      .where(and(
        eq(follows.status, "accepted"),
        or(
          and(
            eq(follows.followerId, ownerUserId),
            eq(follows.followingId, recipientUserId),
          ),
          and(
            eq(follows.followerId, recipientUserId),
            eq(follows.followingId, ownerUserId),
          ),
        ),
      ))
      .for("share")
      .limit(2);
    if (pairUsers.length !== 2 || block || reciprocalRows.length !== 2) {
      throw new DrillShareError(
        "Drills can only be shared when you follow each other.",
        409,
      );
    }

    await tx
      .insert(drillShares)
      .values({ drillId, recipientUserId })
      .onConflictDoNothing({
        target: [drillShares.drillId, drillShares.recipientUserId],
      });
    return { drillId, recipientUserId, shared: true };
  });
}
