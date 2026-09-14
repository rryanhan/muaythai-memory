import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test, { type TestContext } from "node:test";
import type { spawn } from "node:child_process";
import {
  createFfmpegChildEnvironment,
  createJournalPosterFfmpegArgs,
  runFfmpegCommand,
  runJournalPosterBackfillCommand,
  type JournalPosterBackfillRow,
  type JournalPosterBackfillRuntime,
} from "./backfill-journal-posters";
import {
  assertValidJournalVideoRow,
  loadJournalPosterBackfillRuntime,
  removeStoragePoster,
  writeLimitedVideoStream,
} from "./journal-poster-backfill-runtime";
import {
  JOURNAL_VIDEO_MAX_BYTES,
  isJournalVideoMime,
  journalVideoExtension,
} from "@/modules/journal/constants";

const STAGING_PROJECT_REF = "seiroxntlvyudgvseyss";
const PRODUCTION_PROJECT_REF = "pbzqwvowkpfhxptvmrny";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const ENTRY_ID = "00000000-0000-4000-8000-000000000002";
const MEDIA_ID = "00000000-0000-4000-8000-000000000003";
const VIDEO_ID = "00000000-0000-4000-8000-000000000004";
const POSTER_PATH = `${USER_ID}/${ENTRY_ID}/poster-00000000-0000-4000-8000-000000000005.jpg`;

const ROW: JournalPosterBackfillRow = {
  entryId: ENTRY_ID,
  mediaId: MEDIA_ID,
  userId: USER_ID,
  storagePath: `${USER_ID}/${ENTRY_ID}/${VIDEO_ID}.mp4`,
  mimeType: "video/mp4",
  sizeBytes: 4,
};

test("poster backfill rejects unsafe targets and operation arguments before runtime or ffmpeg", async (context) => {
  const productionAsStaging = await createEnvironmentFile(
    context,
    hostedEnvironment("staging", PRODUCTION_PROJECT_REF),
  );
  const production = await createEnvironmentFile(
    context,
    hostedEnvironment("production", PRODUCTION_PROJECT_REF),
  );
  let runtimeLoads = 0;
  let ffmpegCalls = 0;
  const dependencies = {
    targetEnvironment: {},
    log: () => undefined,
    logError: () => undefined,
    loadRuntime: async () => {
      runtimeLoads += 1;
      return createRuntime();
    },
    runFfmpeg: async () => {
      ffmpegCalls += 1;
    },
  };

  await assert.rejects(
    runJournalPosterBackfillCommand(["--unknown-option"], dependencies),
    /does not accept operation arguments/,
  );
  await assert.rejects(
    runJournalPosterBackfillCommand(
      [
        "--profile=staging",
        `--environment-file=${productionAsStaging}`,
      ],
      dependencies,
    ),
    new RegExp(`Expected staging Supabase project ${STAGING_PROJECT_REF}`),
  );
  await assert.rejects(
    runJournalPosterBackfillCommand(
      ["--profile=production", `--environment-file=${production}`],
      dependencies,
    ),
    new RegExp(`requires --confirm-production=${PRODUCTION_PROJECT_REF}`),
  );

  assert.equal(runtimeLoads, 0);
  assert.equal(ffmpegCalls, 0);
});

test("poster backfill reaches runtime only after exact production confirmation", async (context) => {
  const environmentFile = await createEnvironmentFile(
    context,
    hostedEnvironment("production", PRODUCTION_PROJECT_REF),
  );
  let runtimeLoaded = false;
  let closed = false;
  let ffmpegCalled = false;

  const result = await runJournalPosterBackfillCommand(
    [
      "--profile=production",
      `--environment-file=${environmentFile}`,
      `--confirm-production=${PRODUCTION_PROJECT_REF}`,
    ],
    {
      targetEnvironment: {},
      log: () => undefined,
      loadRuntime: async () => {
        runtimeLoaded = true;
        return createRuntime({
          rows: [],
          overrides: {
            close: async () => {
              closed = true;
            },
          },
        });
      },
      runFfmpeg: async () => {
        ffmpegCalled = true;
      },
    },
  );

  assert.deepEqual(result, { completed: 0, failed: 0, skipped: 0 });
  assert.equal(runtimeLoaded, true);
  assert.equal(ffmpegCalled, true);
  assert.equal(closed, true);
});

test("selected PATH, TMPDIR, FFREPORT, and secrets cannot influence ffmpeg or scratch placement", async (context) => {
  const trustedScratch = await createTemporaryDirectory(context);
  const sentinelPath = path.join(trustedScratch, "keep.txt");
  await writeFile(sentinelPath, "keep");
  const environmentFile = await createEnvironmentFile(context, {
    ...hostedEnvironment("staging", STAGING_PROJECT_REF),
    PATH: "/selected/evil-bin",
    TMPDIR: "/selected/evil-tmp",
    FFREPORT: "file=/selected/evil-report",
    OPENAI_API_KEY: "selected-openai-secret",
  });
  const targetEnvironment: Record<string, string | undefined> = {
    PATH: "/trusted/bin",
    PATHEXT: ".EXE;.CMD",
    SystemRoot: "C:\\Windows",
    TMPDIR: trustedScratch,
    GITHUB_TOKEN: "ambient-github-secret",
    AWS_SECRET_ACCESS_KEY: "ambient-aws-secret",
    DATABASE_POOLER_URL: "ambient-database-secret",
    SUPABASE_SERVICE_ROLE_KEY: "ambient-service-role-secret",
  };
  const seenEnvironments: NodeJS.ProcessEnv[] = [];
  let writtenInputPath = "";
  const runtime = createRuntime({
    overrides: {
      writeVideoToFile: async (_row, destinationPath) => {
        writtenInputPath = destinationPath;
        await writeFile(destinationPath, new Uint8Array([1, 2, 3, 4]));
      },
    },
  });

  await runJournalPosterBackfillCommand(
    ["--profile=staging", `--environment-file=${environmentFile}`],
    {
      targetEnvironment,
      getTemporaryDirectory: () => targetEnvironment.TMPDIR!,
      log: () => undefined,
      logError: () => undefined,
      loadRuntime: async () => runtime,
      runFfmpeg: async (args, environment) => {
        seenEnvironments.push({ ...environment });
        if (args[0] !== "-version") {
          await writeFile(args.at(-1)!, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
        }
      },
    },
  );

  assert.ok(writtenInputPath.startsWith(`${trustedScratch}${path.sep}`));
  assert.equal(targetEnvironment.PATH, "/selected/evil-bin");
  assert.equal(targetEnvironment.TMPDIR, "/selected/evil-tmp");
  assert.ok(seenEnvironments.length >= 2);
  for (const environment of seenEnvironments) {
    assert.deepEqual(environment, {
      PATH: "/trusted/bin",
      PATHEXT: ".EXE;.CMD",
      SystemRoot: "C:\\Windows",
    });
  }
  assert.equal(await readFile(sentinelPath, "utf8"), "keep");
  await assert.rejects(stat(path.dirname(writtenInputPath)), /ENOENT/);
});

test("poster backfill generates, uploads, commits, and closes its runtime", async (context) => {
  const environmentFile = await createStagingEnvironmentFile(context);
  let closed = false;
  let uploadedPoster: File | undefined;
  const ffmpegCalls: string[][] = [];
  const runtime = createRuntime({
    overrides: {
      uploadPoster: async (_row, poster, posterPath) => {
        uploadedPoster = poster;
        assert.equal(posterPath, POSTER_PATH);
      },
      close: async () => {
        closed = true;
      },
    },
  });

  const result = await runJournalPosterBackfillCommand(
    ["--profile=staging", `--environment-file=${environmentFile}`],
    {
      targetEnvironment: {},
      log: () => undefined,
      logError: () => undefined,
      loadRuntime: async () => runtime,
      runFfmpeg: createFakeFfmpeg(ffmpegCalls),
    },
  );

  assert.deepEqual(result, { completed: 1, failed: 0, skipped: 0 });
  assert.equal(uploadedPoster?.type, "image/jpeg");
  assert.equal(uploadedPoster?.size, 4);
  assert.equal(closed, true);
  assert.deepEqual(ffmpegCalls[0], ["-version"]);
  assert.ok(ffmpegCalls[1].includes("file"));
  assert.ok(ffmpegCalls[1].includes("1"));
  assert.match(ffmpegCalls[1].join(" "), /scale=.*min\(720,iw\).*thumbnail=120/);
});

test("bounded keyset pages continue past persistent failures", async (context) => {
  const environmentFile = await createStagingEnvironmentFile(context);
  const firstPage = Array.from({ length: 25 }, (_, index) => createRow(index));
  const finalRow = createRow(25);
  const listCalls: Array<{ limit: number; afterEntryId?: string }> = [];
  const runtime = createRuntime({
    overrides: {
      listMissingPosters: async (options) => {
        listCalls.push(options);
        return listCalls.length === 1 ? firstPage : [finalRow];
      },
      writeVideoToFile: async (row, destinationPath) => {
        if (row !== finalRow) throw new Error("permanent malformed video");
        await writeFile(destinationPath, new Uint8Array([1, 2, 3, 4]));
      },
    },
  });

  const result = await runJournalPosterBackfillCommand(
    ["--profile=staging", `--environment-file=${environmentFile}`],
    {
      targetEnvironment: {},
      log: () => undefined,
      logError: () => undefined,
      loadRuntime: async () => runtime,
      runFfmpeg: createFakeFfmpeg(),
    },
  );

  assert.deepEqual(result, { completed: 1, failed: 25, skipped: 0 });
  assert.equal(listCalls.length, 2);
  assert.equal(listCalls[0].limit, 25);
  assert.equal(listCalls[1].afterEntryId, firstPage[24].entryId);
});

test("an ambiguous database response is success when readback finds the generated path", async (context) => {
  const environmentFile = await createStagingEnvironmentFile(context);
  let currentPosterPath: string | null = null;
  const removed: string[] = [];
  const runtime = createRuntime({
    overrides: {
      commitPosterPath: async (_row, posterPath) => {
        currentPosterPath = posterPath;
        throw new Error("connection ended after commit");
      },
      readPosterPath: async () => currentPosterPath,
      removePoster: async (posterPath) => {
        removed.push(posterPath);
      },
    },
  });

  const result = await runCommand(environmentFile, runtime);

  assert.deepEqual(result, { completed: 1, failed: 0, skipped: 0 });
  assert.deepEqual(removed, []);
});

test("a losing commit removes only its generated candidate and counts the skip", async (context) => {
  const environmentFile = await createStagingEnvironmentFile(context);
  const removed: string[] = [];
  const runtime = createRuntime({
    overrides: {
      commitPosterPath: async () => false,
      readPosterPath: async () => "another-worker-poster.jpg",
      removePoster: async (posterPath) => {
        removed.push(posterPath);
      },
    },
  });

  const result = await runCommand(environmentFile, runtime);

  assert.deepEqual(result, { completed: 0, failed: 0, skipped: 1 });
  assert.deepEqual(removed, [POSTER_PATH]);
});

test("candidate removal errors are failures and do not mutate the reusable command exit code", async (context) => {
  const environmentFile = await createStagingEnvironmentFile(context);
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  const errors: string[] = [];
  const runtime = createRuntime({
    overrides: {
      commitPosterPath: async () => false,
      readPosterPath: async () => null,
      removePoster: async () => {
        throw new Error("storage removal failed");
      },
    },
  });

  try {
    const result = await runCommand(environmentFile, runtime, errors);
    assert.deepEqual(result, { completed: 0, failed: 1, skipped: 0 });
    assert.match(errors[0], /storage removal failed/);
    assert.equal(process.exitCode, undefined);
  } finally {
    process.exitCode = previousExitCode;
  }
});

test("unknown reconciliation state preserves the candidate and reports failure", async (context) => {
  const environmentFile = await createStagingEnvironmentFile(context);
  let removed = false;
  const runtime = createRuntime({
    overrides: {
      uploadPoster: async () => {
        throw new Error("upload response was lost");
      },
      readPosterPath: async () => {
        throw new Error("database read unavailable");
      },
      removePoster: async () => {
        removed = true;
      },
    },
  });

  const result = await runCommand(environmentFile, runtime);

  assert.deepEqual(result, { completed: 0, failed: 1, skipped: 0 });
  assert.equal(removed, false);
});

test("a logger failure after commit never removes the committed candidate", async (context) => {
  const environmentFile = await createStagingEnvironmentFile(context);
  let removed = false;
  let closed = false;
  const runtime = createRuntime({
    overrides: {
      removePoster: async () => {
        removed = true;
      },
      close: async () => {
        closed = true;
      },
    },
  });

  await assert.rejects(
    runJournalPosterBackfillCommand(
      ["--profile=staging", `--environment-file=${environmentFile}`],
      {
        targetEnvironment: {},
        log: (message) => {
          if (message.startsWith("Generated poster")) {
            throw new Error("logger failed");
          }
        },
        logError: () => undefined,
        loadRuntime: async () => runtime,
        runFfmpeg: createFakeFfmpeg(),
      },
    ),
    /logger failed/,
  );
  assert.equal(removed, false);
  assert.equal(closed, true);
});

test("operation and runtime-close failures are preserved together", async (context) => {
  const environmentFile = await createStagingEnvironmentFile(context);
  const runtime = createRuntime({
    overrides: {
      close: async () => {
        throw new Error("close failed");
      },
    },
  });

  await assert.rejects(
    runJournalPosterBackfillCommand(
      ["--profile=staging", `--environment-file=${environmentFile}`],
      {
        targetEnvironment: {},
        log: () => undefined,
        loadRuntime: async () => runtime,
        runFfmpeg: async () => {
          throw new Error("ffmpeg failed");
        },
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(
        error.errors.map((item) => String(item)),
        ["Error: ffmpeg failed", "Error: close failed"],
      );
      return true;
    },
  );
});

test("runtime initialization closes an opened database when later imports fail", async () => {
  let closed = false;
  await assert.rejects(
    loadJournalPosterBackfillRuntime({
      loadDatabaseClient: async () => ({
        postgresClient: {
          end: async () => {
            closed = true;
          },
        },
      }) as never,
      initializeRuntime: async () => {
        throw new Error("later import failed");
      },
    }),
    /later import failed/,
  );
  assert.equal(closed, true);
});

test("video row validation accepts only the recorded owner's canonical object", () => {
  const constants = {
    JOURNAL_VIDEO_MAX_BYTES,
    isJournalVideoMime,
    journalVideoExtension,
  };

  assert.doesNotThrow(() => assertValidJournalVideoRow(ROW, constants));
  assert.doesNotThrow(() =>
    assertValidJournalVideoRow(
      {
        ...ROW,
        storagePath: `${USER_ID}/${ENTRY_ID}/${VIDEO_ID}.mov`,
        mimeType: "video/quicktime",
      },
      constants,
    ),
  );

  for (const invalidRow of [
    { ...ROW, sizeBytes: 0 },
    { ...ROW, sizeBytes: 1.5 },
    { ...ROW, sizeBytes: JOURNAL_VIDEO_MAX_BYTES + 1 },
    { ...ROW, mimeType: "video/avi" },
  ]) {
    assert.throws(
      () => assertValidJournalVideoRow(invalidRow, constants),
      /invalid recorded video metadata/,
    );
  }

  for (const storagePath of [
    `${ENTRY_ID}/${USER_ID}/${VIDEO_ID}.mp4`,
    `${USER_ID}/${ENTRY_ID}/nested/${VIDEO_ID}.mp4`,
    `${USER_ID}/${ENTRY_ID}/not-a-uuid.mp4`,
    `${USER_ID}/${ENTRY_ID}/${VIDEO_ID}.webm`,
  ]) {
    assert.throws(
      () => assertValidJournalVideoRow({ ...ROW, storagePath }, constants),
      /does not match its entry, owner, and media type/,
    );
  }
});

test("limited video streaming writes an exact-size body", async (context) => {
  const directory = await createTemporaryDirectory(context);
  const destinationPath = path.join(directory, "video.mp4");

  await writeLimitedVideoStream(
    createByteStream([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
    ]),
    destinationPath,
    4,
  );

  assert.deepEqual(await readFile(destinationPath), Buffer.from([1, 2, 3, 4]));
});

test("limited video streaming rejects short and oversized bodies", async (context) => {
  const directory = await createTemporaryDirectory(context);

  await assert.rejects(
    writeLimitedVideoStream(
      createByteStream([new Uint8Array([1, 2, 3])]),
      path.join(directory, "short.mp4"),
      4,
    ),
    /ended before its recorded byte length/,
  );
  await assert.rejects(
    writeLimitedVideoStream(
      createByteStream([
        new Uint8Array([1, 2]),
        new Uint8Array([3, 4, 5]),
      ]),
      path.join(directory, "oversized.mp4"),
      4,
    ),
    /exceeded its recorded byte length/,
  );
});

test("limited video streaming propagates source errors", async (context) => {
  const directory = await createTemporaryDirectory(context);
  const sourceError = new Error("source stream failed");

  await assert.rejects(
    writeLimitedVideoStream(
      createFailingByteStream(new Uint8Array([1, 2]), sourceError),
      path.join(directory, "failed.mp4"),
      4,
    ),
    sourceError,
  );
});

test("limited video streaming uses exclusive creation and preserves collisions", async (context) => {
  const directory = await createTemporaryDirectory(context);
  const destinationPath = path.join(directory, "existing.mp4");
  await writeFile(destinationPath, "preserve-me");

  await assert.rejects(
    writeLimitedVideoStream(
      createByteStream([new Uint8Array([1, 2, 3, 4])]),
      destinationPath,
      4,
    ),
    (error: unknown) => {
      assert.equal((error as NodeJS.ErrnoException).code, "EEXIST");
      return true;
    },
  );
  assert.equal(await readFile(destinationPath, "utf8"), "preserve-me");
});

test("storage poster removal ignores not-found responses but preserves other errors", async () => {
  const posterPath = "owner/entry/poster.jpg";
  const returnedNotFound = { statusCode: "404" };
  const thrownNotFound = { status: 404 };
  const returnedFailure = new Error("storage unavailable");
  const thrownFailure = new Error("network failed");

  await removeStoragePoster(
    { remove: async () => ({ error: returnedNotFound }) },
    posterPath,
  );
  await removeStoragePoster(
    {
      remove: async () => {
        throw thrownNotFound;
      },
    },
    posterPath,
  );
  await assert.rejects(
    removeStoragePoster(
      { remove: async () => ({ error: returnedFailure }) },
      posterPath,
    ),
    returnedFailure,
  );
  await assert.rejects(
    removeStoragePoster(
      {
        remove: async () => {
          throw thrownFailure;
        },
      },
      posterPath,
    ),
    thrownFailure,
  );
});

test("ffmpeg environment and poster arguments are tightly constrained", () => {
  assert.deepEqual(
    createFfmpegChildEnvironment({
      PATH: "/trusted/bin",
      PATHEXT: ".EXE",
      SystemRoot: "C:\\Windows",
      WINDIR: "C:\\Windows",
      FFREPORT: "file=stolen-report",
      DATABASE_POOLER_URL: "database-secret",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      OPENAI_API_KEY: "openai-secret",
      GITHUB_TOKEN: "github-secret",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
    }),
    {
      PATH: "/trusted/bin",
      PATHEXT: ".EXE",
      SystemRoot: "C:\\Windows",
      WINDIR: "C:\\Windows",
    },
  );

  const args = createJournalPosterFfmpegArgs("/tmp/input.mp4", "/tmp/output.jpg");
  assert.equal(args.at(-1), "/tmp/output.jpg");
  assert.deepEqual(
    args.slice(args.indexOf("-protocol_whitelist"), args.indexOf("-i")),
    [
      "-protocol_whitelist",
      "file",
      "-threads",
      "1",
      "-max_pixels",
      "16777216",
    ],
  );
  assert.match(args[args.indexOf("-vf") + 1], /^scale=.*min\(720,iw\).*min\(720,ih\).*thumbnail=120$/);
  assert.deepEqual(
    args.slice(args.lastIndexOf("-threads"), args.indexOf("-q:v")),
    ["-threads", "1"],
  );
  assert.ok(args.indexOf("-threads") < args.indexOf("-i"));
  assert.ok(args.lastIndexOf("-threads") > args.indexOf("-i"));
});

test("ffmpeg timeout waits for child close before rejecting", async () => {
  const child = new EventEmitter() as EventEmitter & {
    stderr: PassThrough;
    kill: (signal: NodeJS.Signals) => boolean;
  };
  child.stderr = new PassThrough();
  let killedWith: NodeJS.Signals | undefined;
  child.kill = (signal) => {
    killedWith = signal;
    return true;
  };
  const spawnProcess = (() => child) as unknown as typeof spawn;

  const command = runFfmpegCommand([], {} as NodeJS.ProcessEnv, {
    spawnProcess,
    timeoutMilliseconds: 5,
    terminationGraceMilliseconds: 100,
  });
  let settled = false;
  void command.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(killedWith, "SIGKILL");
  assert.equal(settled, false);
  child.emit("close", null, "SIGKILL");
  await assert.rejects(command, /exceeded its 5 ms execution limit/);
});

test("ffmpeg timeout has a bounded fallback when the child never closes", async () => {
  const child = new EventEmitter() as EventEmitter & {
    stderr: PassThrough;
    kill: () => boolean;
  };
  child.stderr = new PassThrough();
  child.kill = () => true;
  const spawnProcess = (() => child) as unknown as typeof spawn;

  await assert.rejects(
    runFfmpegCommand([], {} as NodeJS.ProcessEnv, {
      spawnProcess,
      timeoutMilliseconds: 5,
      terminationGraceMilliseconds: 5,
    }),
    /exceeded its 5 ms execution limit/,
  );
});

async function runCommand(
  environmentFile: string,
  runtime: JournalPosterBackfillRuntime,
  errors: string[] = [],
) {
  return runJournalPosterBackfillCommand(
    ["--profile=staging", `--environment-file=${environmentFile}`],
    {
      targetEnvironment: {},
      log: () => undefined,
      logError: (message) => errors.push(message),
      loadRuntime: async () => runtime,
      runFfmpeg: createFakeFfmpeg(),
    },
  );
}

function createRuntime({
  rows = [ROW],
  overrides = {},
}: {
  rows?: JournalPosterBackfillRow[];
  overrides?: Partial<JournalPosterBackfillRuntime>;
} = {}): JournalPosterBackfillRuntime {
  return {
    listMissingPosters: async () => rows,
    writeVideoToFile: async (_row, destinationPath) => {
      await writeFile(destinationPath, new Uint8Array([1, 2, 3, 4]));
    },
    createPosterPath: () => POSTER_PATH,
    uploadPoster: async () => undefined,
    commitPosterPath: async () => true,
    readPosterPath: async () => null,
    removePoster: async () => undefined,
    close: async () => undefined,
    ...overrides,
  };
}

function createFakeFfmpeg(calls: string[][] = []) {
  return async (args: string[]) => {
    calls.push(args);
    if (args[0] !== "-version") {
      await writeFile(
        args.at(-1)!,
        new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      );
    }
  };
}

function createByteStream(
  chunks: Uint8Array[],
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function createFailingByteStream(
  firstChunk: Uint8Array,
  error: Error,
): ReadableStream<Uint8Array> {
  let sentFirstChunk = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sentFirstChunk) {
        sentFirstChunk = true;
        controller.enqueue(firstChunk);
        return;
      }
      controller.error(error);
    },
  });
}

function createRow(index: number): JournalPosterBackfillRow {
  const suffix = (index + 10).toString(16).padStart(12, "0");
  const entryId = `00000000-0000-4000-8000-${suffix}`;
  return {
    ...ROW,
    entryId,
    mediaId: `10000000-0000-4000-8000-${suffix}`,
    storagePath: `${USER_ID}/${entryId}/${VIDEO_ID}.mp4`,
  };
}

async function createStagingEnvironmentFile(
  context: TestContext,
): Promise<string> {
  return createEnvironmentFile(
    context,
    hostedEnvironment("staging", STAGING_PROJECT_REF),
  );
}

function hostedEnvironment(
  marker: "staging" | "production",
  projectRef: string,
): Record<string, string> {
  return {
    DEPLOYMENT_ENVIRONMENT: marker,
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: `${projectRef}-service-role`,
    DATABASE_POOLER_URL:
      `postgresql://postgres.${projectRef}:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
  };
}

async function createEnvironmentFile(
  context: TestContext,
  environment: Record<string, string>,
): Promise<string> {
  const directory = await createTemporaryDirectory(context);
  const environmentFile = path.join(directory, "maintenance.env");
  await writeFile(
    environmentFile,
    `${Object.entries(environment)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
  );
  return environmentFile;
}

async function createTemporaryDirectory(context: TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "poster-backfill-test-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
