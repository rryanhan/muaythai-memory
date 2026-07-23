import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadAccessControlEnvironment,
  parseAccessControlOptions,
} from "./database-access-control-environment";

const STAGING_PROJECT_REF = "seiroxntlvyudgvseyss";

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

test("an explicit expected environment is required", () => {
  assert.throws(
    () => parseAccessControlOptions([]),
    /Use --expect=staging or --expect=production/,
  );
});
