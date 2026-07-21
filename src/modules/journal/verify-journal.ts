import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, postgresClient } from "@/db/client";
import { drills, journalEntries, journalMedia, users } from "@/db/schema";
import { JOURNAL_VIDEO_MAX_BYTES } from "./constants";
import { createJournalUploadInputSchema, journalDateSchema, updateJournalEntryInputSchema } from "./contracts";
import { completeJournalUpload, createJournalUploadIntent } from "./mutations";
import { decodeJournalCursor, encodeJournalCursor, getOwnedJournalRow, isOwnedDrill, listJournalEntries } from "./queries";
import { validateJournalVideoFile } from "@/features/journal/upload-journal-video";
import { scoreVideoFrame } from "@/features/journal/create-video-poster";

async function main() {
  verifyContracts();
  verifyCursor();
  verifyPosterScoring();
  await verifyOwnershipAndVisibility();
  console.log("Journal verification passed: validation, cursoring, ready visibility, drill ownership, and user isolation are stable.");
}

function verifyPosterScoring() {
  const darkFrame = new Uint8ClampedArray(16 * 4);
  const darkScore = scoreVideoFrame(darkFrame);
  assert.equal(darkScore.usable, false);
  assert.equal(darkScore.score, 0);

  const detailedFrame = new Uint8ClampedArray(16 * 4);
  for (let pixel = 0; pixel < 16; pixel += 1) {
    const value = pixel % 2 === 0 ? 52 : 218;
    detailedFrame.set([value, value, value, 255], pixel * 4);
  }
  const detailedScore = scoreVideoFrame(detailedFrame);
  assert.equal(detailedScore.usable, true);
  assert.ok(detailedScore.score > 0);
}

function verifyContracts() {
  assert.equal(journalDateSchema.safeParse("2026-02-29").success, false);
  assert.equal(journalDateSchema.parse("2026-07-16"), "2026-07-16");
  assert.equal(createJournalUploadInputSchema.safeParse({
    fileName: "clip.mp4",
    mimeType: "video/mp4",
    sizeBytes: JOURNAL_VIDEO_MAX_BYTES + 1,
    occurredOn: "2026-07-16",
  }).success, false);
  assert.deepEqual(updateJournalEntryInputSchema.parse({
    occurredOn: "2026-07-16",
    caption: "  Better timing  ",
    drillId: null,
  }), {
    occurredOn: "2026-07-16",
    caption: "Better timing",
    drillId: null,
  });
  assert.throws(
    () => validateJournalVideoFile(new File([new Uint8Array([1])], "clip.avi", { type: "video/x-msvideo" })),
    /MP4, WebM, or QuickTime/,
  );
}

function verifyCursor() {
  const source = { occurredOn: "2026-07-16", createdAt: new Date("2026-07-16T12:00:00Z"), id: randomUUID() };
  const decoded = decodeJournalCursor(encodeJournalCursor(source));
  assert.equal(decoded.occurredOn, source.occurredOn);
  assert.equal(decoded.createdAt.toISOString(), source.createdAt.toISOString());
  assert.equal(decoded.id, source.id);
  assert.throws(() => decodeJournalCursor("not-a-cursor"), /Invalid journal cursor/);
}

async function verifyOwnershipAndVisibility() {
  const userA = randomUUID();
  const userB = randomUUID();
  const drillA = randomUUID();
  const drillB = randomUUID();
  const readyA = randomUUID();
  const uploadingA = randomUUID();
  const readyB = randomUUID();

  try {
    await db.insert(users).values([
      { id: userA, displayName: "Journal Verify A" },
      { id: userB, displayName: "Journal Verify B" },
    ]);
    await db.insert(drills).values([
      { id: drillA, userId: userA, title: "A Drill", summary: "" },
      { id: drillB, userId: userB, title: "B Drill", summary: "" },
    ]);
    await db.insert(journalEntries).values([
      { id: readyA, userId: userA, drillId: drillA, occurredOn: "2026-07-16", caption: "A", status: "ready" },
      { id: uploadingA, userId: userA, occurredOn: "2026-07-15", status: "uploading" },
      { id: readyB, userId: userB, drillId: drillB, occurredOn: "2026-07-16", caption: "B", status: "ready" },
    ]);
    await db.insert(journalMedia).values([
      { journalEntryId: readyA, storagePath: `${userA}/${readyA}/clip.mp4`, mimeType: "video/mp4", sizeBytes: 1 },
      { journalEntryId: uploadingA, storagePath: `${userA}/${uploadingA}/clip.mp4`, mimeType: "video/mp4", sizeBytes: 1 },
      { journalEntryId: readyB, storagePath: `${userB}/${readyB}/clip.mp4`, mimeType: "video/mp4", sizeBytes: 1 },
    ]);

    const listA = await listJournalEntries(userA);
    const listB = await listJournalEntries(userB);
    assert.deepEqual(listA.entries.map((entry) => entry.id), [readyA]);
    assert.deepEqual(listB.entries.map((entry) => entry.id), [readyB]);
    assert.equal(listA.entries[0]?.posterUrl, null);
    assert.equal(listA.entries[0]?.drill?.id, drillA);
    assert.deepEqual((await listJournalEntries(userA, { drillId: drillA })).entries.map((entry) => entry.id), [readyA]);
    assert.deepEqual((await listJournalEntries(userA, { drillId: drillB })).entries, []);
    assert.equal(await isOwnedDrill(userA, drillA), true);
    assert.equal(await isOwnedDrill(userA, drillB), false);
    assert.equal(await getOwnedJournalRow(userB, readyA), null);
    await assert.rejects(completeJournalUpload(userA, uploadingA), /Choose a journal cover/);

    await assert.rejects(
      createJournalUploadIntent(userA, {
        fileName: "clip.mp4",
        mimeType: "video/mp4",
        sizeBytes: 1,
        occurredOn: "2026-07-16",
        drillId: drillB,
      }),
      /Linked drill not found/,
    );
  } finally {
    await db.delete(users).where(eq(users.id, userA));
    await db.delete(users).where(eq(users.id, userB));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await postgresClient.end();
});
