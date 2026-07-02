import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

config({ path: ".env.local" });

const connectionString = process.env.DATABASE_POOLER_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_POOLER_URL or DATABASE_URL is required.");
}

const client = postgres(connectionString, {
  max: 10,
});

export const db = drizzle(client, { schema });
export { client as postgresClient };
