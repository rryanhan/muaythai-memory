import assert from "node:assert/strict";
import { config } from "dotenv";
import { verifyDeploymentEnvironment } from "../src/config/deployment-environment";
import { getEnvironmentFilePath } from "../src/config/environment-file";
import {
  describeDatabaseUrl,
  getMigrationDatabaseUrl,
  getRuntimeDatabaseConfig,
  getSupabaseSessionPoolerUrl,
} from "../src/db/connection-config";

config({ path: getEnvironmentFilePath() });

verifyConnectionRules();
verifyEnvironmentIsolationRules();

const runtime = getRuntimeDatabaseConfig();
const migrationUrl = getMigrationDatabaseUrl();

console.log(
  `Runtime database: ${describeDatabaseUrl(runtime.connectionString)} (max ${runtime.maxConnections})`,
);
console.log(`Migration database: ${describeDatabaseUrl(migrationUrl)}`);
console.log("Database connection configuration is valid.");

function verifyConnectionRules() {
  const transactionUrl =
    "postgresql://user:password@aws-1-us-west-2.pooler.supabase.com:6543/postgres";
  const sessionUrl =
    "postgresql://user:password@aws-1-us-west-2.pooler.supabase.com:5432/postgres";
  const directUrl =
    "postgresql://user:password@db.example.supabase.co:5432/postgres";

  assert.equal(
    getRuntimeDatabaseConfig({
      DATABASE_POOLER_URL: transactionUrl,
      VERCEL: "1",
    }).maxConnections,
    1,
  );
  assert.throws(
    () => getRuntimeDatabaseConfig({ DATABASE_POOLER_URL: sessionUrl }),
    /port 6543/,
  );
  assert.throws(
    () =>
      getRuntimeDatabaseConfig({
        DATABASE_POOLER_URL: transactionUrl,
        DATABASE_POOL_MAX: "0",
      }),
    /integer from 1 through 10/,
  );
  const expectedDirectUrl = new URL(directUrl);
  expectedDirectUrl.searchParams.set("sslmode", "require");
  assert.equal(
    getMigrationDatabaseUrl({ DATABASE_DIRECT_URL: directUrl }),
    expectedDirectUrl.toString(),
  );
  const expectedConfiguredSessionUrl = new URL(sessionUrl);
  expectedConfiguredSessionUrl.searchParams.set("sslmode", "require");
  assert.equal(
    getMigrationDatabaseUrl({ DATABASE_DIRECT_URL: sessionUrl }),
    expectedConfiguredSessionUrl.toString(),
  );
  const derivedSessionUrl = new URL(
    getSupabaseSessionPoolerUrl({ DATABASE_POOLER_URL: transactionUrl }),
  );
  const expectedSessionUrl = new URL(sessionUrl);
  expectedSessionUrl.searchParams.set("sslmode", "require");
  assert.equal(derivedSessionUrl.toString(), expectedSessionUrl.toString());
  assert.equal(derivedSessionUrl.port, "5432");
  assert.deepEqual(derivedSessionUrl.searchParams.getAll("sslmode"), [
    "require",
  ]);
  assert.throws(
    () => getSupabaseSessionPoolerUrl({ DATABASE_POOLER_URL: directUrl }),
    /Supabase pooler URL/,
  );
  assert.throws(
    () => getMigrationDatabaseUrl({ DATABASE_DIRECT_URL: transactionUrl }),
    /direct database host/,
  );
  assert.throws(() => getMigrationDatabaseUrl({}), /required for migrations/);
}

function verifyEnvironmentIsolationRules() {
  const projectRef = "abcdefghijklmnopqrst";
  const environment = {
    DEPLOYMENT_ENVIRONMENT: "staging",
    NEXT_PUBLIC_APP_URL: "https://staging.example.com",
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    AUTH_FLOW_SECRET: "test-auth-flow-secret-with-at-least-thirty-two-bytes",
    DATABASE_POOLER_URL:
      `postgresql://postgres.${projectRef}:password@aws-1-us-west-2.pooler.supabase.com:6543/postgres`,
    DATABASE_DIRECT_URL:
      `postgresql://postgres:password@db.${projectRef}.supabase.co:5432/postgres`,
  };

  assert.equal(
    verifyDeploymentEnvironment("staging", environment).projectRef,
    projectRef,
  );
  assert.throws(
    () =>
      verifyDeploymentEnvironment("staging", {
        ...environment,
        DATABASE_DIRECT_URL:
          "postgresql://postgres:password@db.wrongprojectref.supabase.co:5432/postgres",
      }),
    /does not belong to Supabase project/,
  );
  assert.throws(
    () => verifyDeploymentEnvironment("production", environment),
    /Expected production configuration/,
  );
}
