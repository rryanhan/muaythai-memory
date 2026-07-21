import assert from "node:assert/strict";
import { config } from "dotenv";
import {
  describeDatabaseUrl,
  getMigrationDatabaseUrl,
  getRuntimeDatabaseConfig,
} from "../src/db/connection-config";

config({ path: ".env.local" });

verifyConnectionRules();

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
  assert.equal(
    getMigrationDatabaseUrl({ DATABASE_DIRECT_URL: directUrl }),
    directUrl,
  );
  assert.throws(
    () => getMigrationDatabaseUrl({ DATABASE_DIRECT_URL: transactionUrl }),
    /direct database host/,
  );
  assert.throws(() => getMigrationDatabaseUrl({}), /required for migrations/);
}
