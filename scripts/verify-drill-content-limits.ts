import { config } from "dotenv";
import postgres from "postgres";
import { DRILL_LIMITS } from "@/config/domain-limits";
import { getEnvironmentFilePath } from "@/config/environment-file";
import { getMigrationDatabaseUrl } from "@/db/connection-config";

config({ path: getEnvironmentFilePath() });

type DrillViolation = {
  id: string;
  fields: string[];
};

type StepViolation = {
  drillId: string;
  id: string;
};

const sql = postgres(getMigrationDatabaseUrl(), { max: 1, prepare: false });

async function main() {
  const drillViolations = await sql<DrillViolation[]>`
    select
      id,
      array_remove(array[
        case
          when char_length(btrim(title)) < 1
            or char_length(btrim(title)) > ${DRILL_LIMITS.titleCharacters}
          then 'title'
        end,
        case
          when char_length(summary) > ${DRILL_LIMITS.summaryCharacters}
          then 'summary'
        end,
        case
          when notes is not null
            and char_length(notes) > ${DRILL_LIMITS.notesCharacters}
          then 'notes'
        end
      ], null) as fields
    from drills
    where char_length(btrim(title)) < 1
      or char_length(btrim(title)) > ${DRILL_LIMITS.titleCharacters}
      or char_length(summary) > ${DRILL_LIMITS.summaryCharacters}
      or (
        notes is not null
        and char_length(notes) > ${DRILL_LIMITS.notesCharacters}
      )
    order by id
  `;
  const stepViolations = await sql<StepViolation[]>`
    select id, drill_id as "drillId"
    from drill_steps
    where char_length(btrim(body)) < 1
      or char_length(btrim(body)) > ${DRILL_LIMITS.stepCharacters}
    order by drill_id, position
  `;

  if (drillViolations.length > 0 || stepViolations.length > 0) {
    for (const row of drillViolations) {
      console.error(`Drill ${row.id} exceeds limits in: ${row.fields.join(", ")}.`);
    }
    for (const row of stepViolations) {
      console.error(`Step ${row.id} on drill ${row.drillId} exceeds body limits.`);
    }
    throw new Error(
      `Drill content preflight failed for ${drillViolations.length} drill rows and ${stepViolations.length} step rows.`,
    );
  }

  console.log("Drill content preflight passed: all existing rows satisfy launch limits.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
