import { config } from "dotenv";
import { getEnvironmentFilePath } from "@/config/environment-file";
import { postgresClient } from "@/db/client";
import { cleanupAbandonedJournalUploads } from "@/modules/journal/mutations";

config({ path: getEnvironmentFilePath() });

async function main() {
  const batchSize = 25;
  const result = await cleanupAbandonedJournalUploads(undefined, { batchSize });
  console.log(
    `Journal cleanup processed one batch of up to ${batchSize} candidate(s): `
      + `${result.removed} removed; ${result.failed} failed. Run again if more candidates may remain.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await postgresClient.end();
});
