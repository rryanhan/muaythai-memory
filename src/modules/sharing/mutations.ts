import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  drillShares,
  drills,
  friendships,
  users,
} from "@/db/schema";
import type { UpdateDrillShareResponse } from "./contracts";
import { DrillShareError } from "./errors";
import { canonicalFriendPair } from "@/modules/friends/pair";

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

    const pair = canonicalFriendPair(ownerUserId, recipientUserId);
    const [friendship] = await tx
      .select({ status: friendships.status })
      .from(friendships)
      .innerJoin(users, eq(users.id, recipientUserId))
      .where(and(
        eq(friendships.userOneId, pair.userOneId),
        eq(friendships.userTwoId, pair.userTwoId),
        eq(friendships.status, "accepted"),
      ))
      .for("share")
      .limit(1);
    if (!friendship) {
      throw new DrillShareError(
        "Drills can only be shared with current friends.",
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
