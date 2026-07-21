import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnvironmentFilePath } from "@/config/environment-file";
import * as schema from "./schema";
import { getRuntimeDatabaseConfig } from "./connection-config";

config({ path: getEnvironmentFilePath() });

const { connectionString, maxConnections } = getRuntimeDatabaseConfig();

// Keep each application instance's pool deliberately small because serverless
// concurrency multiplies this value across active functions.
const client = postgres(connectionString, {
  max: maxConnections,
  // Supabase's transaction pooler does not support prepared statements. This
  // also keeps the client safe for short-lived serverless function instances.
  prepare: false,
});

export const db = drizzle(client, { schema });
export { client as postgresClient };
