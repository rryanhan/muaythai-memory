import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { getMigrationDatabaseUrl } from "./src/db/connection-config";

config({ path: ".env.local" });

const databaseUrl = getMigrationDatabaseUrl();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
