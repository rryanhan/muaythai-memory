import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadAccessControlEnvironment,
  parseAccessControlOptions,
} from "./database-access-control-environment";
import {
  createKnownDeploymentChildEnvironment,
  installKnownDeploymentEnvironment,
  loadKnownDeploymentEnvironment,
  runWithKnownDeploymentEnvironment,
} from "./known-deployment-environment";

const STAGING_PROJECT_REF = "seiroxntlvyudgvseyss";
const PRODUCTION_PROJECT_REF = "pbzqwvowkpfhxptvmrny";

test("the selected file overrides conflicting ambient values without mutation", async (context) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "access-control-environment-"),
  );
  context.after(() => rm(directory, { force: true, recursive: true }));

  const environmentFile = path.join(directory, "staging.env");
  await writeFile(
    environmentFile,
    [
      "DEPLOYMENT_ENVIRONMENT=staging",
      "NEXT_PUBLIC_APP_URL=https://staging.example.com",
      `NEXT_PUBLIC_SUPABASE_URL=https://${STAGING_PROJECT_REF}.supabase.co`,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=staging-publishable",
      "SUPABASE_SERVICE_ROLE_KEY=staging-service-role",
      "AUTH_FLOW_SECRET=test-auth-flow-secret-with-at-least-thirty-two-bytes",
      `DATABASE_POOLER_URL=postgresql://postgres.${STAGING_PROJECT_REF}:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
      `DATABASE_DIRECT_URL=postgresql://postgres:password@db.${STAGING_PROJECT_REF}.supabase.co:5432/postgres`,
      "",
    ].join("\n"),
  );

  const ambientEnvironment = {
    DEPLOYMENT_ENVIRONMENT: "production",
    NEXT_PUBLIC_APP_URL: "https://production.example.com",
    NEXT_PUBLIC_SUPABASE_URL:
      "https://ambientproduction.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "ambient-publishable",
    SUPABASE_SERVICE_ROLE_KEY: "ambient-service-role",
    DATABASE_POOLER_URL:
      "postgresql://postgres.ambientproduction:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres",
    DATABASE_DIRECT_URL:
      "postgresql://postgres:password@db.ambientproduction.supabase.co:5432/postgres",
  };
  const originalAmbient = { ...ambientEnvironment };

  const loaded = loadAccessControlEnvironment(
    [`--expect=staging`, `--env-file=${environmentFile}`],
    ambientEnvironment,
  );

  assert.equal(loaded.summary.environment, "staging");
  assert.equal(loaded.summary.projectRef, STAGING_PROJECT_REF);
  assert.equal(
    loaded.environment.NEXT_PUBLIC_SUPABASE_URL,
    `https://${STAGING_PROJECT_REF}.supabase.co`,
  );
  assert.deepEqual(ambientEnvironment, originalAmbient);
});

test("expected environment validation rejects a mismatched file", async (context) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "access-control-environment-"),
  );
  context.after(() => rm(directory, { force: true, recursive: true }));

  const environmentFile = path.join(directory, "production.env");
  await writeFile(
    environmentFile,
    [
      "DEPLOYMENT_ENVIRONMENT=production",
      "NEXT_PUBLIC_APP_URL=https://production.example.com",
      "NEXT_PUBLIC_SUPABASE_URL=https://productionproject.supabase.co",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=production-publishable",
      "SUPABASE_SERVICE_ROLE_KEY=production-service-role",
      "DATABASE_POOLER_URL=postgresql://postgres.productionproject:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres",
      "DATABASE_DIRECT_URL=postgresql://postgres:password@db.productionproject.supabase.co:5432/postgres",
      "",
    ].join("\n"),
  );

  assert.throws(
    () =>
      loadAccessControlEnvironment(
        [`--expect=staging`, `--env-file=${environmentFile}`],
        {},
      ),
    /Expected staging configuration, received production/,
  );
});

test("the expected target rejects a self-consistent wrong Supabase project", async (context) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "access-control-environment-"),
  );
  context.after(() => rm(directory, { force: true, recursive: true }));

  const wrongProject = "wrongstagingproject";
  const environmentFile = path.join(directory, "wrong-project.env");
  await writeFile(
    environmentFile,
    [
      "DEPLOYMENT_ENVIRONMENT=staging",
      "NEXT_PUBLIC_APP_URL=https://staging.example.com",
      `NEXT_PUBLIC_SUPABASE_URL=https://${wrongProject}.supabase.co`,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=staging-publishable",
      "SUPABASE_SERVICE_ROLE_KEY=staging-service-role",
      "AUTH_FLOW_SECRET=test-auth-flow-secret-with-at-least-thirty-two-bytes",
      `DATABASE_POOLER_URL=postgresql://postgres.${wrongProject}:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
      `DATABASE_DIRECT_URL=postgresql://postgres:password@db.${wrongProject}.supabase.co:5432/postgres`,
      "",
    ].join("\n"),
  );

  assert.throws(
    () =>
      loadAccessControlEnvironment(
        [`--expect=staging`, `--env-file=${environmentFile}`],
        {},
      ),
    /Expected staging Supabase project seiroxntlvyudgvseyss, received wrongstagingproject/,
  );
});

test("a pooler-style username on an arbitrary host does not establish project identity", async (context) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "access-control-environment-"),
  );
  context.after(() => rm(directory, { force: true, recursive: true }));

  const environmentFile = path.join(directory, "forged-pooler-host.env");
  const environment = deploymentEnvironment("staging", STAGING_PROJECT_REF);
  environment.DATABASE_POOLER_URL =
    `postgresql://postgres.${STAGING_PROJECT_REF}:password@evil.example:6543/postgres`;
  await writeFile(environmentFile, serializeEnvironment(environment));

  assert.throws(
    () =>
      loadAccessControlEnvironment(
        [`--expect=staging`, `--env-file=${environmentFile}`],
        {},
      ),
    new RegExp(
      `DATABASE_POOLER_URL does not belong to Supabase project ${STAGING_PROJECT_REF}`,
    ),
  );
});

test("a comma-separated multi-host URL does not establish project identity", async (context) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "access-control-environment-"),
  );
  context.after(() => rm(directory, { force: true, recursive: true }));

  const environmentFile = path.join(directory, "multi-host-pooler.env");
  const environment = deploymentEnvironment("staging", STAGING_PROJECT_REF);
  environment.DATABASE_POOLER_URL =
    `postgresql://postgres.${STAGING_PROJECT_REF}:password@evil.example,aws-0-us-west-1.pooler.supabase.com:6543/postgres`;
  await writeFile(environmentFile, serializeEnvironment(environment));

  assert.throws(
    () =>
      loadAccessControlEnvironment(
        [`--expect=staging`, `--env-file=${environmentFile}`],
        {},
      ),
    new RegExp(
      `DATABASE_POOLER_URL does not belong to Supabase project ${STAGING_PROJECT_REF}`,
    ),
  );
});

test("the shared target guard rejects production credentials mislabeled as staging before consumer work starts", async (context) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "known-deployment-environment-"),
  );
  context.after(() => rm(directory, { force: true, recursive: true }));

  const environmentFile = path.join(directory, "production-as-staging.env");
  await writeFile(
    environmentFile,
    serializeEnvironment(
      deploymentEnvironment("staging", PRODUCTION_PROJECT_REF),
    ),
  );
  let operationStarted = false;

  assert.throws(
    () =>
      runWithKnownDeploymentEnvironment(
        { expectedEnvironment: "staging", environmentFile },
        () => {
          operationStarted = true;
        },
      ),
    new RegExp(
      `Expected staging Supabase project ${STAGING_PROJECT_REF}, received ${PRODUCTION_PROJECT_REF}`,
    ),
  );
  assert.equal(operationStarted, false);
});

test("a child process cannot inherit an ambient migration URL missing from the selected file", async (context) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "known-deployment-environment-"),
  );
  context.after(() => rm(directory, { force: true, recursive: true }));

  const selectedEnvironment = deploymentEnvironment(
    "staging",
    STAGING_PROJECT_REF,
  );
  selectedEnvironment.DATABASE_URL = selectedEnvironment.DATABASE_DIRECT_URL;
  delete selectedEnvironment.DATABASE_DIRECT_URL;

  const environmentFile = path.join(directory, "database-url-only.env");
  await writeFile(
    environmentFile,
    serializeEnvironment(selectedEnvironment),
  );

  const deployment = loadKnownDeploymentEnvironment({
    expectedEnvironment: "staging",
    environmentFile,
  });
  const childEnvironment = createKnownDeploymentChildEnvironment(
    deployment,
    {
      DATABASE_DIRECT_URL:
        `postgresql://postgres:password@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`,
      PATH: "/test-bin",
    },
  );

  assert.equal(childEnvironment.DATABASE_DIRECT_URL, undefined);
  assert.equal(
    childEnvironment.DATABASE_URL,
    selectedEnvironment.DATABASE_URL,
  );
  assert.equal(childEnvironment.PATH, "/test-bin");

  const installedEnvironment: Record<string, string | undefined> = {
    DATABASE_DIRECT_URL:
      `postgresql://postgres:password@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`,
    PATH: "/test-bin",
  };
  installKnownDeploymentEnvironment(deployment, installedEnvironment);
  assert.equal(installedEnvironment.DATABASE_DIRECT_URL, undefined);
  assert.equal(
    installedEnvironment.DATABASE_URL,
    selectedEnvironment.DATABASE_URL,
  );
  assert.equal(installedEnvironment.PATH, "/test-bin");
});

test("missing file credentials never fall back to ambient secrets", async (context) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "access-control-environment-"),
  );
  context.after(() => rm(directory, { force: true, recursive: true }));

  const environmentFile = path.join(directory, "incomplete.env");
  await writeFile(
    environmentFile,
    [
      "DEPLOYMENT_ENVIRONMENT=staging",
      "NEXT_PUBLIC_APP_URL=https://staging.example.com",
      `NEXT_PUBLIC_SUPABASE_URL=https://${STAGING_PROJECT_REF}.supabase.co`,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=staging-publishable",
      "SUPABASE_SERVICE_ROLE_KEY=staging-service-role",
      "AUTH_FLOW_SECRET=test-auth-flow-secret-with-at-least-thirty-two-bytes",
      `DATABASE_DIRECT_URL=postgresql://postgres:password@db.${STAGING_PROJECT_REF}.supabase.co:5432/postgres`,
      "",
    ].join("\n"),
  );

  assert.throws(
    () =>
      loadAccessControlEnvironment(
        [`--expect=staging`, `--env-file=${environmentFile}`],
        {
          DATABASE_POOLER_URL:
            `postgresql://postgres.${STAGING_PROJECT_REF}:ambient-password@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
        },
      ),
    /DATABASE_POOLER_URL is required/,
  );
});

test("a missing selected file never falls back to ambient credentials", async (context) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "access-control-environment-"),
  );
  context.after(() => rm(directory, { force: true, recursive: true }));

  assert.throws(
    () =>
      loadAccessControlEnvironment(
        [
          "--expect=staging",
          `--env-file=${path.join(directory, "missing.env")}`,
        ],
        deploymentEnvironment("staging", STAGING_PROJECT_REF),
      ),
    /Could not load access-control environment file/,
  );
});

test("an explicit expected environment is required", () => {
  assert.throws(
    () => parseAccessControlOptions([]),
    /Use --expect=staging or --expect=production/,
  );
});

function deploymentEnvironment(
  environment: "staging" | "production",
  projectRef: string,
): Record<string, string> {
  return {
    DEPLOYMENT_ENVIRONMENT: environment,
    NEXT_PUBLIC_APP_URL: `https://${environment}.example.com`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `${environment}-publishable`,
    SUPABASE_SERVICE_ROLE_KEY: `${environment}-service-role`,
    AUTH_FLOW_SECRET: "test-auth-flow-secret-with-at-least-thirty-two-bytes",
    DATABASE_POOLER_URL:
      `postgresql://postgres.${projectRef}:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
    DATABASE_DIRECT_URL:
      `postgresql://postgres:password@db.${projectRef}.supabase.co:5432/postgres`,
  };
}

function serializeEnvironment(environment: Record<string, string>): string {
  return `${Object.entries(environment)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n")}\n`;
}
