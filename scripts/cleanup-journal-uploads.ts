import { config } from "dotenv";
import { postgresClient } from "@/db/client";
import { cleanupAbandonedJournalUploads } from "@/modules/journal/mutations";

config({ path: ".env.local" });

async function main() {
  const result = await cleanupAbandonedJournalUploads();
  console.log(`Journal cleanup removed ${result.removed} abandoned upload(s); ${result.failed} failed.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await postgresClient.end();
});
