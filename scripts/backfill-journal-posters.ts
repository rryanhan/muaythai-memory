import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { db, postgresClient } from "@/db/client";
import { journalEntries, journalMedia } from "@/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { JOURNAL_MEDIA_BUCKET } from "@/modules/journal/constants";
import { uploadJournalPosterObject } from "@/modules/journal/poster";

async function main() {
  await run("ffmpeg", ["-version"]);
  const rows = await db
    .select({
      entryId: journalEntries.id,
      userId: journalEntries.userId,
      storagePath: journalMedia.storagePath,
    })
    .from(journalEntries)
    .innerJoin(journalMedia, eq(journalMedia.journalEntryId, journalEntries.id))
    .where(and(eq(journalEntries.status, "ready"), isNull(journalMedia.posterPath)));

  if (rows.length === 0) {
    console.log("Journal poster backfill found no missing posters.");
    return;
  }

  const bucket = createSupabaseAdminClient().storage.from(JOURNAL_MEDIA_BUCKET);
  let completed = 0;
  let failed = 0;

  for (const row of rows) {
    const directory = await mkdtemp(join(tmpdir(), "muaythai-journal-poster-"));
    const inputExtension = extname(row.storagePath) || ".video";
    const inputPath = join(directory, `source${inputExtension}`);
    const outputPath = join(directory, "poster.jpg");
    let uploadedPosterPath: string | null = null;

    try {
      const { data, error } = await bucket.download(row.storagePath);
      if (error || !data) throw new Error(error?.message ?? "Video could not be downloaded.");
      await writeFile(inputPath, new Uint8Array(await data.arrayBuffer()));
      await run("ffmpeg", [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-vf",
        "thumbnail=120,scale=720:-2:force_original_aspect_ratio=decrease",
        "-frames:v",
        "1",
        "-q:v",
        "3",
        outputPath,
      ]);

      const posterBytes = await readFile(outputPath);
      const poster = new File([posterBytes], "journal-poster.jpg", { type: "image/jpeg" });
      uploadedPosterPath = await uploadJournalPosterObject(row.userId, row.entryId, poster);
      const [updated] = await db
        .update(journalMedia)
        .set({ posterPath: uploadedPosterPath, updatedAt: new Date() })
        .where(and(eq(journalMedia.journalEntryId, row.entryId), isNull(journalMedia.posterPath)))
        .returning({ id: journalMedia.id });

      if (!updated) {
        await bucket.remove([uploadedPosterPath]);
        uploadedPosterPath = null;
        continue;
      }

      completed += 1;
      console.log(`Generated poster for journal entry ${row.entryId}.`);
    } catch (error) {
      failed += 1;
      if (uploadedPosterPath) await bucket.remove([uploadedPosterPath]).catch(() => undefined);
      console.error(`Journal entry ${row.entryId} failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  console.log(`Journal poster backfill completed ${completed}; ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => reject(new Error(`${command} could not start: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} exited with code ${code ?? "unknown"}.`));
    });
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await postgresClient.end();
});
