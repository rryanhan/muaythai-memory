import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

config({ path: ".env.local" });

const connectionString = process.env.DATABASE_POOLER_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_POOLER_URL or DATABASE_URL is required.");
}

// Prefer Supabase's pooler in development and serverless-style runtimes. Keep
// this cap deliberately low because session-pooler projects can reject bursts
// once multiple Next workers/dev servers are alive.
const client = postgres(connectionString, {
  max: Number(process.env.DATABASE_POOL_MAX ?? 3),
});

export const db = drizzle(client, { schema });
export { client as postgresClient };
