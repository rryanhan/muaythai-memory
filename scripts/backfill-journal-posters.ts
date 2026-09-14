import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  formatMaintenancePreflight,
  parseMaintenanceOptions,
  runWithMaintenanceEnvironment,
  type DeploymentEnvironmentValues,
} from "./maintenance-environment";

export type JournalPosterBackfillRow = {
  entryId: string;
  mediaId: string;
  userId: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
};

export type JournalPosterBackfillRuntime = {
  listMissingPosters: (options: {
    limit: number;
    afterEntryId?: string;
  }) => Promise<JournalPosterBackfillRow[]>;
  writeVideoToFile: (
    row: JournalPosterBackfillRow,
    destinationPath: string,
  ) => Promise<void>;
  createPosterPath: (row: JournalPosterBackfillRow) => string;
  uploadPoster: (
    row: JournalPosterBackfillRow,
    poster: File,
    posterPath: string,
  ) => Promise<void>;
  commitPosterPath: (
    row: JournalPosterBackfillRow,
    posterPath: string,
  ) => Promise<boolean>;
  readPosterPath: (row: JournalPosterBackfillRow) => Promise<string | null>;
  removePoster: (posterPath: string) => Promise<void>;
  close: () => Promise<void>;
};

export type JournalPosterBackfillResult = {
  completed: number;
  failed: number;
  skipped: number;
};

type FfmpegRunner = (
  args: string[],
  environment: NodeJS.ProcessEnv,
) => Promise<void>;

type JournalPosterBackfillCommandDependencies = {
  loadRuntime?: () => Promise<JournalPosterBackfillRuntime>;
  runFfmpeg?: FfmpegRunner;
  log?: (message: string) => void;
  logError?: (message: string) => void;
  getTemporaryDirectory?: () => string;
  targetEnvironment?: DeploymentEnvironmentValues;
};

const FFMPEG_EXECUTION_ENVIRONMENT_KEYS = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
] as const;

const MAX_FFMPEG_ERROR_OUTPUT_LENGTH = 64 * 1024;
const FFMPEG_TIMEOUT_MILLISECONDS = 2 * 60 * 1000;
const FFMPEG_TERMINATION_GRACE_MILLISECONDS = 5 * 1000;
const JOURNAL_POSTER_BACKFILL_BATCH_SIZE = 25;

/** Restricts ffmpeg to executable-discovery variables, never application secrets. */
export function createFfmpegChildEnvironment(
  ambientEnvironment: DeploymentEnvironmentValues = process.env,
): NodeJS.ProcessEnv {
  const environment: Record<string, string> = {};
  for (const key of FFMPEG_EXECUTION_ENVIRONMENT_KEYS) {
    const value = ambientEnvironment[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment as NodeJS.ProcessEnv;
}

async function loadDefaultJournalPosterBackfillRuntime(): Promise<JournalPosterBackfillRuntime> {
  const { loadJournalPosterBackfillRuntime } = await import(
    "./journal-poster-backfill-runtime"
  );
  return loadJournalPosterBackfillRuntime();
}

export async function runJournalPosterBackfillCommand(
  args: string[],
  {
    loadRuntime = loadDefaultJournalPosterBackfillRuntime,
    runFfmpeg = runFfmpegCommand,
    log = console.log,
    logError = console.error,
    getTemporaryDirectory = tmpdir,
    targetEnvironment = process.env,
  }: JournalPosterBackfillCommandDependencies = {},
): Promise<JournalPosterBackfillResult> {
  const options = parseMaintenanceOptions(args);
  if (options.operationArgs.length > 0) {
    throw new Error(
      `Journal poster backfill does not accept operation arguments: ${options.operationArgs.join(" ")}`,
    );
  }

  // Capture process-launch and scratch-directory inputs before the selected
  // dotenv file is installed. A maintenance file must never choose the ffmpeg
  // binary or redirect temporary video data.
  const ffmpegEnvironment = createFfmpegChildEnvironment(targetEnvironment);
  const temporaryDirectory = getTemporaryDirectory();

  return runWithMaintenanceEnvironment(
    {
      profile: options.profile,
      environmentFile: options.environmentFile,
      productionConfirmation: options.productionConfirmation,
      capabilities: ["database", "supabase-admin"],
      errorContext: "journal poster backfill environment",
      targetEnvironment,
    },
    async (maintenance) => {
      log(formatMaintenancePreflight("Journal poster backfill", maintenance));
      const runtime = await loadRuntime();
      return runWithClosableRuntime(runtime, async () => {
        await runFfmpeg(["-version"], ffmpegEnvironment);

        let completed = 0;
        let failed = 0;
        let skipped = 0;
        let afterEntryId: string | undefined;
        let scanned = 0;

        while (true) {
          const rows = await runtime.listMissingPosters({
            limit: JOURNAL_POSTER_BACKFILL_BATCH_SIZE,
            afterEntryId,
          });
          if (rows.length === 0) break;
          scanned += rows.length;

          for (const row of rows) {
            let outcome: "completed" | "skipped";
            try {
              outcome = await processJournalPosterRow(
                row,
                runtime,
                runFfmpeg,
                ffmpegEnvironment,
                temporaryDirectory,
              );
            } catch (error) {
              failed += 1;
              logError(
                `Journal entry ${row.entryId} failed: ${formatError(error)}`,
              );
              continue;
            }

            if (outcome === "completed") {
              completed += 1;
              log(`Generated poster for journal entry ${row.entryId}.`);
            } else {
              skipped += 1;
              log(
                `Skipped journal entry ${row.entryId} because its state changed during backfill.`,
              );
            }
          }

          const lastRow = rows.at(-1)!;
          afterEntryId = lastRow.entryId;
          if (rows.length < JOURNAL_POSTER_BACKFILL_BATCH_SIZE) break;
        }

        if (scanned === 0) {
          log("Journal poster backfill found no missing posters.");
          return { completed: 0, failed: 0, skipped: 0 };
        }

        log(
          `Journal poster backfill scanned ${scanned} candidate(s) in pages of up to ${JOURNAL_POSTER_BACKFILL_BATCH_SIZE}: `
            + `${completed} completed; ${skipped} skipped; ${failed} failed.`,
        );
        return { completed, failed, skipped };
      });
    },
  );
}

async function runWithClosableRuntime<Result>(
  runtime: JournalPosterBackfillRuntime,
  operation: () => Promise<Result>,
): Promise<Result> {
  let result: Result | undefined;
  let operationError: unknown;
  try {
    result = await operation();
  } catch (error) {
    operationError = error;
  }

  let closeError: unknown;
  try {
    await runtime.close();
  } catch (error) {
    closeError = error;
  }

  if (operationError && closeError) {
    throw new AggregateError(
      [operationError, closeError],
      "Journal poster backfill and database cleanup both failed.",
    );
  }
  if (operationError) throw operationError;
  if (closeError) throw closeError;
  return result as Result;
}

async function processJournalPosterRow(
  row: JournalPosterBackfillRow,
  runtime: JournalPosterBackfillRuntime,
  runFfmpeg: FfmpegRunner,
  ffmpegEnvironment: NodeJS.ProcessEnv,
  temporaryDirectory: string,
): Promise<"completed" | "skipped"> {
  let directory: string | undefined;
  let outcome: "completed" | "skipped" | undefined;
  let operationError: unknown;

  try {
    directory = await mkdtemp(
      join(temporaryDirectory, "muaythai-journal-poster-"),
    );
    outcome = await generateAndCommitJournalPoster(
      row,
      runtime,
      runFfmpeg,
      ffmpegEnvironment,
      directory,
    );
  } catch (error) {
    operationError = error;
  }

  let cleanupError: unknown;
  if (directory) {
    try {
      await rm(directory, { recursive: true, force: true });
    } catch (error) {
      cleanupError = error;
    }
  }

  if (operationError && cleanupError) {
    throw new AggregateError(
      [operationError, cleanupError],
      "Poster generation and temporary-file cleanup both failed.",
    );
  }
  if (operationError) throw operationError;
  if (cleanupError) {
    throw new Error("Poster temporary files could not be removed.", {
      cause: cleanupError,
    });
  }
  if (!outcome) throw new Error("Poster generation did not produce an outcome.");
  return outcome;
}

async function generateAndCommitJournalPoster(
  row: JournalPosterBackfillRow,
  runtime: JournalPosterBackfillRuntime,
  runFfmpeg: FfmpegRunner,
  ffmpegEnvironment: NodeJS.ProcessEnv,
  directory: string,
): Promise<"completed" | "skipped"> {
  const inputExtension = extname(row.storagePath) || ".video";
  const inputPath = join(directory, `source${inputExtension}`);
  const outputPath = join(directory, "poster.jpg");
  let generatedPosterPath: string | null = null;

  try {
    await runtime.writeVideoToFile(row, inputPath);
    await runFfmpeg(
      createJournalPosterFfmpegArgs(inputPath, outputPath),
      ffmpegEnvironment,
    );

    const posterBytes = await readFile(outputPath);
    const poster = new File([posterBytes], "journal-poster.jpg", {
      type: "image/jpeg",
    });
    generatedPosterPath = runtime.createPosterPath(row);
    await runtime.uploadPoster(row, poster, generatedPosterPath);

    let committed: boolean;
    try {
      committed = await runtime.commitPosterPath(
        row,
        generatedPosterPath,
      );
    } catch (commitError) {
      const uncertainPath = generatedPosterPath;
      generatedPosterPath = null;
      try {
        const reconciliation = await reconcileGeneratedPoster(
          runtime,
          row,
          uncertainPath,
        );
        if (reconciliation === "completed") return "completed";
      } catch (reconciliationError) {
        throw new AggregateError(
          [commitError, reconciliationError],
          "Poster database commit and reconciliation both failed; the generated object was preserved.",
        );
      }
      throw commitError;
    }

    if (committed) {
      // Clear local ownership before any later work. Once committed, this
      // object must never be deleted by backfill error handling.
      generatedPosterPath = null;
      return "completed";
    }

    const losingPath = generatedPosterPath;
    generatedPosterPath = null;
    return reconcileGeneratedPoster(runtime, row, losingPath);
  } catch (error) {
    if (!generatedPosterPath) throw error;

    const uncertainPath = generatedPosterPath;
    generatedPosterPath = null;
    try {
      const reconciliation = await reconcileGeneratedPoster(
        runtime,
        row,
        uncertainPath,
      );
      if (reconciliation === "completed") return "completed";
    } catch (reconciliationError) {
      throw new AggregateError(
        [error, reconciliationError],
        "Poster generation and reconciliation both failed; the generated object was preserved.",
      );
    }
    throw error;
  }
}

async function reconcileGeneratedPoster(
  runtime: JournalPosterBackfillRuntime,
  row: JournalPosterBackfillRow,
  generatedPosterPath: string,
): Promise<"completed" | "skipped"> {
  // Read before delete after every ambiguous upload/commit response. If this
  // read fails, its rejection prevents removal and preserves any object that
  // might already be the database's committed poster.
  const currentPosterPath = await runtime.readPosterPath(row);
  if (currentPosterPath === generatedPosterPath) return "completed";
  await runtime.removePoster(generatedPosterPath);
  return "skipped";
}

export function createJournalPosterFfmpegArgs(
  inputPath: string,
  outputPath: string,
): string[] {
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-filter_threads",
    "1",
    "-protocol_whitelist",
    "file",
    "-threads",
    "1",
    "-max_pixels",
    "16777216",
    "-i",
    inputPath,
    "-vf",
    "scale='min(720,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,thumbnail=120",
    "-frames:v",
    "1",
    "-threads",
    "1",
    "-q:v",
    "3",
    outputPath,
  ];
}

export function runFfmpegCommand(
  args: string[],
  environment: NodeJS.ProcessEnv,
  {
    spawnProcess = spawn,
    timeoutMilliseconds = FFMPEG_TIMEOUT_MILLISECONDS,
    terminationGraceMilliseconds = FFMPEG_TERMINATION_GRACE_MILLISECONDS,
  }: {
    spawnProcess?: typeof spawn;
    timeoutMilliseconds?: number;
    terminationGraceMilliseconds?: number;
  } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnProcess("ffmpeg", args, {
      env: environment,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let terminationError: unknown;
    const timeoutState: {
      deadline?: ReturnType<typeof setTimeout>;
      termination?: ReturnType<typeof setTimeout>;
    } = {};
    const timeoutError = () => new Error(
      `ffmpeg exceeded its ${timeoutMilliseconds} ms execution limit.`
        + (terminationError
          ? ` SIGKILL also failed: ${formatError(terminationError)}`
          : ""),
    );
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timeoutState.deadline) clearTimeout(timeoutState.deadline);
      if (timeoutState.termination) clearTimeout(timeoutState.termination);
      if (error) reject(error);
      else resolve();
    };
    timeoutState.deadline = setTimeout(() => {
      timedOut = true;
      timeoutState.termination = setTimeout(() => {
        finish(timeoutError());
      }, terminationGraceMilliseconds);
      try {
        child.kill("SIGKILL");
      } catch (error) {
        terminationError = error;
      }
    }, timeoutMilliseconds);

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      const remaining = MAX_FFMPEG_ERROR_OUTPUT_LENGTH - stderr.length;
      if (remaining > 0) stderr += chunk.slice(0, remaining);
    });
    child.on("error", (error) => {
      finish(
        timedOut
          ? timeoutError()
          : new Error(`ffmpeg could not start: ${error.message}`),
      );
    });
    child.on("close", (code) => {
      if (timedOut) finish(timeoutError());
      else if (code === 0) finish();
      else {
        finish(
          new Error(
            stderr.trim() ||
              `ffmpeg exited with code ${code ?? "unknown"}.`,
          ),
        );
      }
    });
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  runJournalPosterBackfillCommand(process.argv.slice(2))
    .then((result) => {
      if (result.failed > 0) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(formatError(error));
      process.exitCode = 1;
    });
}
