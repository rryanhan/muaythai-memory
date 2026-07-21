import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, postgresClient } from "@/db/client";
import { users } from "@/db/schema";
import { PROFILE_AVATAR_BUCKET, PROFILE_AVATAR_MAX_BYTES, removeOtherUserAvatars, validateAvatarFile } from "./avatar";
import { profileUsernameSchema } from "./contracts";
import { updateProfile } from "./mutations";
import type { CurrentAppUser } from "@/modules/auth";

async function main() {
  assert.equal(profileUsernameSchema.parse("  Ryan_Han  "), "ryan_han");
  assert.equal(profileUsernameSchema.safeParse("x ").success, false);
  assert.equal(profileUsernameSchema.safeParse("x".repeat(31)).success, false);

  const png = new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    "avatar.png",
    { type: "image/png" },
  );
  const validatedPng = await validateAvatarFile(png);
  assert.equal(validatedPng.mime, "image/png");

  await assert.rejects(
    validateAvatarFile(new File([new Uint8Array([0xff, 0xd8, 0xff])], "spoof.png", { type: "image/png" })),
    /does not match/,
  );
  await assert.rejects(
    validateAvatarFile(new File([new Uint8Array([1])], "avatar.gif", { type: "image/gif" })),
    /JPEG, PNG, or WebP/,
  );
  await assert.rejects(
    validateAvatarFile(new File([new Uint8Array(PROFILE_AVATAR_MAX_BYTES + 1)], "large.jpg", { type: "image/jpeg" })),
    /5 MB or smaller/,
  );

  await verifyProfilePersistence(png);
  console.log("Profile verification passed: validation, avatar storage, persistence, removal, and user isolation are stable.");
}

async function verifyProfilePersistence(png: File) {
  const userA = currentUser("profile_verify_a", "a@example.com");
  const userB = currentUser("profile_verify_b", "b@example.com");

  try {
    await db.insert(users).values([
      { id: userA.id, displayName: userA.displayName },
      { id: userB.id, displayName: userB.displayName },
    ]);

    const updated = await updateProfile(userA, {
      username: "updated_fighter",
      firstName: "Updated",
      lastName: "Fighter",
      location: "Vancouver",
      avatar: png,
      removeAvatar: false,
    });
    assert.equal(updated.username, "updated_fighter");
    assert.ok(updated.avatarUrl?.includes(`/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/${userA.id}/`));

    const untouchedUser = await db.query.users.findFirst({ where: (table, operators) => operators.eq(table.id, userB.id) });
    assert.equal(untouchedUser?.displayName, userB.displayName);
    assert.equal(untouchedUser?.avatarUrl, null);

    const removed = await updateProfile({ ...userA, displayName: updated.displayName, username: updated.username, avatarUrl: updated.avatarUrl }, {
      username: updated.username ?? "updated_fighter",
      firstName: updated.firstName ?? "",
      lastName: updated.lastName ?? "",
      location: updated.location ?? "",
      avatar: null,
      removeAvatar: true,
    });
    assert.equal(removed.avatarUrl, null);
  } finally {
    await removeOtherUserAvatars(userA.id, null).catch(() => undefined);
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(users).where(eq(users.id, userB.id));
  }
}

function currentUser(username: string, email: string): CurrentAppUser {
  return {
    id: randomUUID(),
    displayName: username,
    username,
    firstName: null,
    lastName: null,
    location: null,
    avatarUrl: null,
    email,
    profileOnboardedAt: new Date(),
    firstDrillGuideCompletedAt: new Date(),
    firstDrillGuideSkippedAt: null,
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await postgresClient.end();
});
