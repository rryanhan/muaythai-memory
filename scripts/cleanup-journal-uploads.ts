import { pathToFileURL } from "node:url";
import {
  formatMaintenancePreflight,
  parseMaintenanceOptions,
  runWithMaintenanceEnvironment,
  type DeploymentEnvironmentValues,
} from "./maintenance-environment";

type JournalCleanupRuntime = {
  cleanup: (
    now: Date | undefined,
    options: { batchSize: number },
  ) => Promise<{ removed: number; failed: number }>;
  close: () => Promise<void>;
};

type JournalCleanupCommandDependencies = {
  loadRuntime?: () => Promise<JournalCleanupRuntime>;
  log?: (message: string) => void;
  targetEnvironment?: DeploymentEnvironmentValues;
};

export async function runJournalCleanupCommand(
  args: string[],
  {
    loadRuntime = loadJournalCleanupRuntime,
    log = console.log,
    targetEnvironment = process.env,
  }: JournalCleanupCommandDependencies = {},
): Promise<void> {
  const options = parseMaintenanceOptions(args);
  if (options.operationArgs.length > 0) {
    throw new Error(
      `Journal cleanup does not accept operation arguments: ${options.operationArgs.join(" ")}`,
    );
  }

  await runWithMaintenanceEnvironment(
    {
      profile: options.profile,
      environmentFile: options.environmentFile,
      productionConfirmation: options.productionConfirmation,
      capabilities: ["database", "supabase-admin"],
      errorContext: "journal cleanup environment",
      targetEnvironment,
    },
    async (maintenance) => {
      log(formatMaintenancePreflight("Journal cleanup", maintenance));
      const runtime = await loadRuntime();
      try {
        const batchSize = 25;
        const result = await runtime.cleanup(undefined, {
          batchSize,
        });
        log(
          `Journal cleanup processed one batch of up to ${batchSize} candidate(s): `
            + `${result.removed} removed; ${result.failed} failed. Run again if more candidates may remain.`,
        );
        if (result.failed > 0) {
          throw new Error(
            `Journal cleanup failed to process ${result.failed} candidate(s).`,
          );
        }
      } finally {
        await runtime.close();
      }
    },
  );
}

async function loadJournalCleanupRuntime(): Promise<JournalCleanupRuntime> {
  // Environment-bound modules must not initialize before target validation.
  const databaseClient = await import("@/db/client");
  try {
    const { cleanupAbandonedJournalUploads } = await import(
      "@/modules/journal/mutations"
    );
    return {
      cleanup: cleanupAbandonedJournalUploads,
      close: () => databaseClient.postgresClient.end(),
    };
  } catch (error) {
    await databaseClient.postgresClient.end();
    throw error;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  runJournalCleanupCommand(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
