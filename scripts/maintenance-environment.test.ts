import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { runJournalCleanupCommand } from "./cleanup-journal-uploads";
import {
  formatMaintenancePreflight,
  loadMaintenanceEnvironment,
  parseMaintenanceOptions,
  runWithMaintenanceEnvironment,
} from "./maintenance-environment";

const STAGING_PROJECT_REF = "seiroxntlvyudgvseyss";
const PRODUCTION_PROJECT_REF = "pbzqwvowkpfhxptvmrny";

test("maintenance options default to the development profile and preserve operation arguments", () => {
  assert.deepEqual(parseMaintenanceOptions(["--batch-size=10"]), {
    profile: "development",
    environmentFile: ".env.local",
    productionConfirmation: undefined,
    operationArgs: ["--batch-size=10"],
  });
});

test("maintenance options select explicit profiles and files", () => {
  assert.deepEqual(
    parseMaintenanceOptions([
      "--profile=staging",
      "--environment-file=/tmp/staging.env",
    ]),
    {
      profile: "staging",
      environmentFile: "/tmp/staging.env",
      productionConfirmation: undefined,
      operationArgs: [],
    },
  );
  assert.equal(
    parseMaintenanceOptions([
      "--profile=production",
      `--confirm-production=${PRODUCTION_PROJECT_REF}`,
    ]).environmentFile,
    ".env.production-maintenance.local",
  );
});

test("maintenance options reject invalid, duplicate, and misplaced safety flags", () => {
  assert.throws(
    () => parseMaintenanceOptions(["--profile=preview"]),
    /Use --profile=development/,
  );
  assert.throws(
    () => parseMaintenanceOptions(["--profile"]),
    /must use the --option=value form/,
  );
  assert.throws(
    () => parseMaintenanceOptions(["--environment-file="]),
    /must not be empty/,
  );
  assert.throws(
    () => parseMaintenanceOptions(["--environment-file"]),
    /must use the --option=value form/,
  );
  assert.throws(
    () =>
      parseMaintenanceOptions([
        "--profile=staging",
        "--profile=development",
      ]),
    /may only be provided once/,
  );
  assert.throws(
    () =>
      parseMaintenanceOptions([
        "--environment-file=one.env",
        "--environment-file=two.env",
      ]),
    /may only be provided once/,
  );
  assert.throws(
    () =>
      parseMaintenanceOptions([
        "--profile=production",
        `--confirm-production=${PRODUCTION_PROJECT_REF}`,
        `--confirm-production=${PRODUCTION_PROJECT_REF}`,
      ]),
    /may only be provided once/,
  );
  assert.throws(
    () => parseMaintenanceOptions(["--confirm-production"]),
    /must use the --option=value form/,
  );
  assert.throws(
    () =>
      parseMaintenanceOptions([
        `--confirm-production=${PRODUCTION_PROJECT_REF}`,
      ]),
    /only valid with --profile=production/,
  );
});

test("an unmarked development file may resolve coherently to known staging", async (context) => {
  const environmentFile = await createEnvironmentFile(
    context,
    hostedEnvironment(undefined, STAGING_PROJECT_REF),
  );

  const loaded = loadMaintenanceEnvironment({
    profile: "development",
    environmentFile,
    capabilities: ["database", "supabase-admin"],
  });

  assert.equal(loaded.summary.resolvedTarget, "staging");
  assert.equal(loaded.summary.projectRef, STAGING_PROJECT_REF);
});

test("development accepts a fully loopback IPv4 target", async (context) => {
  const environmentFile = await createEnvironmentFile(context, {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SERVICE_ROLE_KEY: "local-service-role",
    DATABASE_POOLER_URL:
      "postgresql://postgres:postgres@localhost:54322/postgres",
  });

  const loaded = loadMaintenanceEnvironment({
    profile: "development",
    environmentFile,
    capabilities: ["database", "supabase-admin"],
  });

  assert.equal(loaded.summary.resolvedTarget, "local");
  assert.equal(loaded.summary.projectRef, undefined);
});

test("development accepts bracketed IPv6 loopback", async (context) => {
  const environmentFile = await createEnvironmentFile(context, {
    NEXT_PUBLIC_SUPABASE_URL: "http://[::1]:54321",
    SUPABASE_SERVICE_ROLE_KEY: "local-service-role",
    DATABASE_POOLER_URL:
      "postgresql://postgres:postgres@[::1]:54322/postgres",
  });

  const loaded = loadMaintenanceEnvironment({
    profile: "development",
    environmentFile,
    capabilities: ["database", "supabase-admin"],
  });

  assert.equal(loaded.summary.resolvedTarget, "local");
});

test("development rejects production even when both services agree", async (context) => {
  const environmentFile = await createEnvironmentFile(
    context,
    hostedEnvironment(undefined, PRODUCTION_PROJECT_REF),
  );

  assert.throws(
    () =>
      loadMaintenanceEnvironment({
        profile: "development",
        environmentFile,
        capabilities: ["database", "supabase-admin"],
      }),
    /development profile may never target production/,
  );
});

test("development rejects unknown hosted projects", async (context) => {
  const environmentFile = await createEnvironmentFile(
    context,
    hostedEnvironment(undefined, "unknownproject"),
  );

  assert.throws(
    () =>
      loadMaintenanceEnvironment({
        profile: "development",
        environmentFile,
        capabilities: ["database", "supabase-admin"],
      }),
    /only loopback services or staging project/,
  );
});

test("development rejects mixed local and hosted services in both directions", async (context) => {
  const localApiHostedDatabase = await createEnvironmentFile(context, {
    ...hostedEnvironment(undefined, STAGING_PROJECT_REF),
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  });
  const hostedApiLocalDatabase = await createEnvironmentFile(context, {
    ...hostedEnvironment(undefined, STAGING_PROJECT_REF),
    DATABASE_POOLER_URL:
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });

  for (const environmentFile of [
    localApiHostedDatabase,
    hostedApiLocalDatabase,
  ]) {
    assert.throws(
      () =>
        loadMaintenanceEnvironment({
          profile: "development",
          environmentFile,
          capabilities: ["database", "supabase-admin"],
        }),
      /must identify the same target/,
    );
  }
});

test("lookalike loopback hosts and unsupported local protocols are rejected", async (context) => {
  const lookalikeHost = await createEnvironmentFile(context, {
    NEXT_PUBLIC_SUPABASE_URL: "https://localhost.evil.com",
    SUPABASE_SERVICE_ROLE_KEY: "local-service-role",
    DATABASE_POOLER_URL:
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });
  const unsupportedProtocol = await createEnvironmentFile(context, {
    NEXT_PUBLIC_SUPABASE_URL: "ftp://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "local-service-role",
    DATABASE_POOLER_URL:
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });

  assert.throws(
    () =>
      loadMaintenanceEnvironment({
        profile: "development",
        environmentFile: lookalikeHost,
        capabilities: ["database", "supabase-admin"],
      }),
    /must identify a Supabase project or a loopback/,
  );
  assert.throws(
    () =>
      loadMaintenanceEnvironment({
        profile: "development",
        environmentFile: unsupportedProtocol,
        capabilities: ["database", "supabase-admin"],
      }),
    /must use HTTP or HTTPS/,
  );
});

test("hosted Supabase URLs must be canonical project origins", async (context) => {
  const invalidUrls = [
    `https://${STAGING_PROJECT_REF}.supabase.co/rest/v1`,
    `https://${STAGING_PROJECT_REF}.supabase.co:444`,
    `https://user:password@${STAGING_PROJECT_REF}.supabase.co`,
    `https://${STAGING_PROJECT_REF}.supabase.co?redirect=production`,
  ];

  for (const supabaseUrl of invalidUrls) {
    const environmentFile = await createEnvironmentFile(context, {
      ...hostedEnvironment("staging", STAGING_PROJECT_REF),
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    });
    assert.throws(
      () =>
        loadMaintenanceEnvironment({
          profile: "staging",
          environmentFile,
          capabilities: ["database", "supabase-admin"],
        }),
      /must be a canonical project origin/,
    );
  }
});

test("database and Supabase hosted project refs must agree", async (context) => {
  const environmentFile = await createEnvironmentFile(
    context,
    hostedEnvironment("staging", STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF),
  );

  assert.throws(
    () =>
      loadMaintenanceEnvironment({
        profile: "staging",
        environmentFile,
        capabilities: ["database", "supabase-admin"],
      }),
    /must identify the same target/,
  );
});

test("a forged pooler username on an arbitrary host is rejected", async (context) => {
  const environmentFile = await createEnvironmentFile(context, {
    ...hostedEnvironment("staging", STAGING_PROJECT_REF),
    DATABASE_POOLER_URL:
      `postgresql://postgres.${STAGING_PROJECT_REF}:password@evil.example:6543/postgres`,
  });

  assert.throws(
    () =>
      loadMaintenanceEnvironment({
        profile: "staging",
        environmentFile,
        capabilities: ["database", "supabase-admin"],
      }),
    /DATABASE_POOLER_URL must identify a Supabase project/,
  );
});

test("a comma-separated multi-host pooler URL is rejected", async (context) => {
  const environmentFile = await createEnvironmentFile(context, {
    ...hostedEnvironment("staging", STAGING_PROJECT_REF),
    DATABASE_POOLER_URL:
      `postgresql://postgres.${STAGING_PROJECT_REF}:password@evil.example,aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
  });

  assert.throws(
    () =>
      loadMaintenanceEnvironment({
        profile: "staging",
        environmentFile,
        capabilities: ["database", "supabase-admin"],
      }),
    /DATABASE_POOLER_URL must identify a Supabase project/,
  );
});

test("maintenance database URLs must be complete and use PostgreSQL", async (context) => {
  const incompleteUrls = [
    `postgresql://postgres.${STAGING_PROJECT_REF}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${STAGING_PROJECT_REF}:password@aws-0-us-west-1.pooler.supabase.com/postgres`,
    `postgresql://postgres.${STAGING_PROJECT_REF}:password@aws-0-us-west-1.pooler.supabase.com:6543`,
  ];

  for (const databaseUrl of incompleteUrls) {
    const environmentFile = await createEnvironmentFile(context, {
      ...hostedEnvironment("staging", STAGING_PROJECT_REF),
      DATABASE_POOLER_URL: databaseUrl,
    });
    assert.throws(
      () =>
        loadMaintenanceEnvironment({
          profile: "staging",
          environmentFile,
          capabilities: ["database", "supabase-admin"],
        }),
      /must include an explicit username, password, host, port, and database name/,
    );
  }

  const wrongProtocolFile = await createEnvironmentFile(context, {
    ...hostedEnvironment("staging", STAGING_PROJECT_REF),
    DATABASE_POOLER_URL:
      `https://postgres.${STAGING_PROJECT_REF}:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
  });
  assert.throws(
    () =>
      loadMaintenanceEnvironment({
        profile: "staging",
        environmentFile: wrongProtocolFile,
        capabilities: ["database", "supabase-admin"],
      }),
    /DATABASE_POOLER_URL must be a valid PostgreSQL connection URL/,
  );
});

test("a hosted direct database URL must use port 5432", async (context) => {
  const environmentFile = await createEnvironmentFile(context, {
    ...hostedEnvironment("staging", STAGING_PROJECT_REF),
    DATABASE_POOLER_URL:
      `postgresql://postgres:password@db.${STAGING_PROJECT_REF}.supabase.co:6543/postgres`,
  });

  assert.throws(
    () =>
      loadMaintenanceEnvironment({
        profile: "staging",
        environmentFile,
        capabilities: ["database", "supabase-admin"],
      }),
    /direct Supabase DATABASE_POOLER_URL must use port 5432/,
  );
});

test("staging requires its marker and exact known project", async (context) => {
  const unmarkedFile = await createEnvironmentFile(
    context,
    hostedEnvironment(undefined, STAGING_PROJECT_REF),
  );
  const productionAsStagingFile = await createEnvironmentFile(
    context,
    hostedEnvironment("staging", PRODUCTION_PROJECT_REF),
  );

  assert.throws(
    () =>
      loadMaintenanceEnvironment({
        profile: "staging",
        environmentFile: unmarkedFile,
        capabilities: ["database", "supabase-admin"],
      }),
    /received no DEPLOYMENT_ENVIRONMENT/,
  );
  assert.throws(
    () =>
      loadMaintenanceEnvironment({
        profile: "staging",
        environmentFile: productionAsStagingFile,
        capabilities: ["database", "supabase-admin"],
      }),
    new RegExp(`Expected staging Supabase project ${STAGING_PROJECT_REF}`),
  );
});

test("production requires its marker, exact project, and exact confirmation", async (context) => {
  const environmentFile = await createEnvironmentFile(
    context,
    hostedEnvironment("production", PRODUCTION_PROJECT_REF),
  );

  for (const productionConfirmation of [undefined, "production", STAGING_PROJECT_REF]) {
    assert.throws(
      () =>
        loadMaintenanceEnvironment({
          profile: "production",
          environmentFile,
          productionConfirmation,
          capabilities: ["database", "supabase-admin"],
        }),
      new RegExp(`requires --confirm-production=${PRODUCTION_PROJECT_REF}`),
    );
  }

  const loaded = loadMaintenanceEnvironment({
    profile: "production",
    environmentFile,
    productionConfirmation: PRODUCTION_PROJECT_REF,
    capabilities: ["database", "supabase-admin"],
  });
  assert.equal(loaded.summary.resolvedTarget, "production");
  assert.equal(loaded.summary.projectRef, PRODUCTION_PROJECT_REF);
});

test("production rejects staging credentials even when labeled production", async (context) => {
  const environmentFile = await createEnvironmentFile(
    context,
    hostedEnvironment("production", STAGING_PROJECT_REF),
  );

  assert.throws(
    () =>
      loadMaintenanceEnvironment({
        profile: "production",
        environmentFile,
        productionConfirmation: PRODUCTION_PROJECT_REF,
        capabilities: ["database", "supabase-admin"],
      }),
    new RegExp(`Expected production Supabase project ${PRODUCTION_PROJECT_REF}`),
  );
});

test("capability validation does not require deployment-only credentials", async (context) => {
  const databaseOnlyFile = await createEnvironmentFile(context, {
    DATABASE_POOLER_URL:
      `postgresql://postgres.${STAGING_PROJECT_REF}:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
  });
  const adminOnlyFile = await createEnvironmentFile(context, {
    NEXT_PUBLIC_SUPABASE_URL:
      `https://${STAGING_PROJECT_REF}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: "staging-service-role",
  });

  assert.equal(
    loadMaintenanceEnvironment({
      profile: "development",
      environmentFile: databaseOnlyFile,
      capabilities: ["database"],
    }).summary.resolvedTarget,
    "staging",
  );
  assert.equal(
    loadMaintenanceEnvironment({
      profile: "development",
      environmentFile: adminOnlyFile,
      capabilities: ["supabase-admin"],
    }).summary.resolvedTarget,
    "staging",
  );
});

test("missing file credentials never fall back to a populated ambient environment", async (context) => {
  const environmentFile = await createEnvironmentFile(context, {
    DEPLOYMENT_ENVIRONMENT: "staging",
    NEXT_PUBLIC_SUPABASE_URL:
      `https://${STAGING_PROJECT_REF}.supabase.co`,
    DATABASE_POOLER_URL:
      `postgresql://postgres.${STAGING_PROJECT_REF}:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
  });
  const targetEnvironment = hostedEnvironment(
    "production",
    PRODUCTION_PROJECT_REF,
  );
  let operationStarted = false;

  await assert.rejects(
    runWithMaintenanceEnvironment(
      {
        profile: "staging",
        environmentFile,
        capabilities: ["database", "supabase-admin"],
        targetEnvironment,
      },
      () => {
        operationStarted = true;
      },
    ),
    /SUPABASE_SERVICE_ROLE_KEY is required/,
  );
  assert.equal(operationStarted, false);
  assert.equal(
    targetEnvironment.NEXT_PUBLIC_SUPABASE_URL,
    `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
  );
});

test("selected maintenance files may not disable TLS verification", async (context) => {
  for (const value of ["0", "1", ""]) {
    const environmentFile = await createEnvironmentFile(context, {
      ...hostedEnvironment("staging", STAGING_PROJECT_REF),
      NODE_TLS_REJECT_UNAUTHORIZED: value,
    });

    assert.throws(
      () =>
        loadMaintenanceEnvironment({
          profile: "staging",
          environmentFile,
          capabilities: ["database", "supabase-admin"],
        }),
      /must not set NODE_TLS_REJECT_UNAUTHORIZED/,
    );
  }
});

test("a missing selected file fails before operation work starts", async (context) => {
  const directory = await createTemporaryDirectory(context);
  let operationStarted = false;

  await assert.rejects(
    runWithMaintenanceEnvironment(
      {
        profile: "staging",
        environmentFile: path.join(directory, "missing.env"),
        capabilities: ["database", "supabase-admin"],
      },
      () => {
        operationStarted = true;
      },
    ),
    /Could not load maintenance environment file/,
  );
  assert.equal(operationStarted, false);
});

test("validated file values replace conflicting ambient target values and preserve unrelated settings", async (context) => {
  const environmentFile = await createEnvironmentFile(
    context,
    hostedEnvironment("staging", STAGING_PROJECT_REF),
  );
  const targetEnvironment: Record<string, string | undefined> = {
    ...hostedEnvironment("production", PRODUCTION_PROJECT_REF),
    APP_ENV_FILE: ".env.production-maintenance.local",
    DATABASE_DIRECT_URL:
      `postgresql://postgres:password@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`,
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
    PGPASSWORD: "ambient-password",
    PGDATABASE: "ambient-database",
    PGHOST: "ambient-host",
    PGHOSTADDR: "203.0.113.1",
    PGPORT: "9999",
    PGSERVICE: "ambient-service",
    PGSERVICEFILE: "/tmp/ambient-service-file",
    PGSSL: "false",
    PGSSLMODE: "disable",
    PGUSER: "ambient-user",
    PGUSERNAME: "ambient-username",
    PATH: "/test-bin",
  };

  await runWithMaintenanceEnvironment(
    {
      profile: "staging",
      environmentFile,
      capabilities: ["database", "supabase-admin"],
      targetEnvironment,
    },
    () => undefined,
  );

  assert.equal(
    targetEnvironment.NEXT_PUBLIC_SUPABASE_URL,
    `https://${STAGING_PROJECT_REF}.supabase.co`,
  );
  assert.equal(targetEnvironment.DATABASE_DIRECT_URL, undefined);
  assert.equal(targetEnvironment.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
  assert.equal(targetEnvironment.PGPASSWORD, undefined);
  assert.equal(targetEnvironment.PGDATABASE, undefined);
  assert.equal(targetEnvironment.PGHOST, undefined);
  assert.equal(targetEnvironment.PGHOSTADDR, undefined);
  assert.equal(targetEnvironment.PGPORT, undefined);
  assert.equal(targetEnvironment.PGSERVICE, undefined);
  assert.equal(targetEnvironment.PGSERVICEFILE, undefined);
  assert.equal(targetEnvironment.PGSSL, undefined);
  assert.equal(targetEnvironment.PGSSLMODE, undefined);
  assert.equal(targetEnvironment.PGUSER, undefined);
  assert.equal(targetEnvironment.PGUSERNAME, undefined);
  assert.equal(targetEnvironment.APP_ENV_FILE, environmentFile);
  assert.equal(targetEnvironment.PATH, "/test-bin");
});

test("preflight output is redacted", async (context) => {
  const environmentFile = await createEnvironmentFile(
    context,
    hostedEnvironment("staging", STAGING_PROJECT_REF),
  );
  const loaded = loadMaintenanceEnvironment({
    profile: "staging",
    environmentFile,
    capabilities: ["database", "supabase-admin"],
  });

  const preflight = formatMaintenancePreflight("Journal cleanup", loaded);
  assert.match(preflight, /staging Supabase project seiroxntlvyudgvseyss/);
  assert.doesNotMatch(preflight, /password|service-role|postgresql:/);
});

test("the real cleanup command never loads its runtime when target validation fails", async (context) => {
  const environmentFile = await createEnvironmentFile(
    context,
    hostedEnvironment("staging", PRODUCTION_PROJECT_REF),
  );
  let runtimeLoaded = false;
  let mutationStarted = false;

  await assert.rejects(
    runJournalCleanupCommand(
      ["--profile=staging", `--environment-file=${environmentFile}`],
      {
        targetEnvironment: {},
        log: () => undefined,
        loadRuntime: async () => {
          runtimeLoaded = true;
          return {
            cleanup: async () => {
              mutationStarted = true;
              return { removed: 0, failed: 0 };
            },
            close: async () => undefined,
          };
        },
      },
    ),
    new RegExp(`Expected staging Supabase project ${STAGING_PROJECT_REF}`),
  );
  assert.equal(runtimeLoaded, false);
  assert.equal(mutationStarted, false);
});

test("cleanup rejects operation arguments before loading its runtime", async () => {
  let runtimeLoaded = false;

  await assert.rejects(
    runJournalCleanupCommand(["--unknown-option"], {
      targetEnvironment: {},
      log: () => undefined,
      loadRuntime: async () => {
        runtimeLoaded = true;
        throw new Error("runtime should not load");
      },
    }),
    /does not accept operation arguments: --unknown-option/,
  );
  assert.equal(runtimeLoaded, false);
});

test("cleanup preserves the existing batch size and closes its runtime", async (context) => {
  const environmentFile = await createEnvironmentFile(
    context,
    hostedEnvironment("staging", STAGING_PROJECT_REF),
  );
  let receivedBatchSize: number | undefined;
  let closed = false;
  const output: string[] = [];

  await runJournalCleanupCommand(
    ["--profile=staging", `--environment-file=${environmentFile}`],
    {
      targetEnvironment: {},
      log: (message) => output.push(message),
      loadRuntime: async () => ({
        cleanup: async (_now, options) => {
          receivedBatchSize = options.batchSize;
          return { removed: 2, failed: 0 };
        },
        close: async () => {
          closed = true;
        },
      }),
    },
  );

  assert.equal(receivedBatchSize, 25);
  assert.equal(closed, true);
  assert.match(output[0] ?? "", /Journal cleanup: staging profile/);
  assert.match(output[1] ?? "", /2 removed; 0 failed/);
});

test("cleanup reports failed candidates, closes, and rejects", async (context) => {
  const environmentFile = await createEnvironmentFile(
    context,
    hostedEnvironment("staging", STAGING_PROJECT_REF),
  );
  let closed = false;
  const output: string[] = [];

  await assert.rejects(
    runJournalCleanupCommand(
      ["--profile=staging", `--environment-file=${environmentFile}`],
      {
        targetEnvironment: {},
        log: (message) => output.push(message),
        loadRuntime: async () => ({
          cleanup: async () => ({ removed: 2, failed: 1 }),
          close: async () => {
            closed = true;
          },
        }),
      },
    ),
    /failed to process 1 candidate/,
  );
  assert.match(output[1] ?? "", /2 removed; 1 failed/);
  assert.equal(closed, true);
});

test("cleanup closes its runtime when the mutation fails", async (context) => {
  const environmentFile = await createEnvironmentFile(
    context,
    hostedEnvironment("staging", STAGING_PROJECT_REF),
  );
  let closed = false;

  await assert.rejects(
    runJournalCleanupCommand(
      ["--profile=staging", `--environment-file=${environmentFile}`],
      {
        targetEnvironment: {},
        log: () => undefined,
        loadRuntime: async () => ({
          cleanup: async () => {
            throw new Error("cleanup failed");
          },
          close: async () => {
            closed = true;
          },
        }),
      },
    ),
    /cleanup failed/,
  );
  assert.equal(closed, true);
});

function hostedEnvironment(
  marker: "staging" | "production" | undefined,
  supabaseProjectRef: string,
  databaseProjectRef = supabaseProjectRef,
): Record<string, string> {
  return {
    ...(marker ? { DEPLOYMENT_ENVIRONMENT: marker } : {}),
    NEXT_PUBLIC_SUPABASE_URL:
      `https://${supabaseProjectRef}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: `${supabaseProjectRef}-service-role`,
    DATABASE_POOLER_URL:
      `postgresql://postgres.${databaseProjectRef}:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
  };
}

async function createEnvironmentFile(
  context: TestContext,
  environment: Record<string, string>,
): Promise<string> {
  const directory = await createTemporaryDirectory(context);
  const environmentFile = path.join(directory, "maintenance.env");
  await writeFile(environmentFile, serializeEnvironment(environment));
  return environmentFile;
}

async function createTemporaryDirectory(
  context: TestContext,
): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "maintenance-environment-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  return directory;
}

function serializeEnvironment(environment: Record<string, string>): string {
  return `${Object.entries(environment)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n")}\n`;
}
