import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { getEnvironmentFilePath } from "./src/config/environment-file";
import { getMigrationDatabaseUrl } from "./src/db/connection-config";

config({ path: getEnvironmentFilePath() });

const databaseUrl = getMigrationDatabaseUrl();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
