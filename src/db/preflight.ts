import { config } from "dotenv";
import postgres from "postgres";
import { getEnvironmentFilePath } from "@/config/environment-file";
import { getMigrationDatabaseUrl } from "./connection-config";

config({ path: getEnvironmentFilePath() });

const targetTables = [
  "users",
  "drills",
  "drill_steps",
  "training_methods",
  "drill_training_methods",
  "tag_categories",
  "tags",
  "drill_tags",
  "status_tags",
  "drill_status_tags",
];

const sql = postgres(getMigrationDatabaseUrl(), { max: 1 });

async function main() {
  const rows = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ${sql(targetTables)}
    order by table_name
  `;

  if (rows.length > 0) {
    console.error(`Migration preflight failed. Existing public tables: ${rows.map((row) => row.table_name).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Migration preflight passed. None of the ${targetTables.length} target public tables exist yet.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
