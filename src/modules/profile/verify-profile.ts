import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, postgresClient } from "@/db/client";
import { users } from "@/db/schema";
import { PROFILE_AVATAR_BUCKET, PROFILE_AVATAR_MAX_BYTES, removeOtherUserAvatars, validateAvatarFile } from "./avatar";
import { profileDisplayNameSchema } from "./contracts";
import { updateProfile } from "./mutations";

async function main() {
  assert.equal(profileDisplayNameSchema.parse("  Ryan Han  "), "Ryan Han");
  assert.equal(profileDisplayNameSchema.safeParse("   ").success, false);
  assert.equal(profileDisplayNameSchema.safeParse("x".repeat(121)).success, false);

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
  const userA = { id: randomUUID(), displayName: "Profile Verify A", avatarUrl: null, email: "a@example.com" };
  const userB = { id: randomUUID(), displayName: "Profile Verify B", avatarUrl: null, email: "b@example.com" };

  try {
    await db.insert(users).values([
      { id: userA.id, displayName: userA.displayName },
      { id: userB.id, displayName: userB.displayName },
    ]);

    const updated = await updateProfile(userA, {
      displayName: "Updated Fighter",
      avatar: png,
      removeAvatar: false,
    });
    assert.equal(updated.displayName, "Updated Fighter");
    assert.ok(updated.avatarUrl?.includes(`/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/${userA.id}/`));

    const untouchedUser = await db.query.users.findFirst({ where: (table, operators) => operators.eq(table.id, userB.id) });
    assert.equal(untouchedUser?.displayName, userB.displayName);
    assert.equal(untouchedUser?.avatarUrl, null);

    const removed = await updateProfile({ ...userA, displayName: updated.displayName, avatarUrl: updated.avatarUrl }, {
      displayName: updated.displayName,
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await postgresClient.end();
});
