import { config } from "dotenv";
import postgres, { type Sql } from "postgres";
import { getEnvironmentFilePath } from "@/config/environment-file";
import { getRuntimeDatabaseConfig } from "@/db/connection-config";

const API_ROLES = ["anon", "authenticated"] as const;
const REQUIRED_DATABASE_ROLES = [...API_ROLES, "postgres"] as const;
const EXPECTED_PUBLIC_TABLES = [
  "drill_status_tags",
  "drill_steps",
  "drill_tags",
  "drill_training_methods",
  "drills",
  "journal_entries",
  "journal_media",
  "status_tags",
  "tag_categories",
  "tags",
  "training_methods",
  "users",
] as const;

type NameRow = { name: string };
type CurrentRoleRow = { currentRole: string };
type ObjectCountRow = {
  tableCount: number;
  sequenceCount: number;
  functionCount: number;
};
type PrivilegeRow = {
  roleName: string;
  objectName: string;
  objectKind: string;
  privilege: string;
};
type DefaultPrivilegeRow = {
  scope: string;
  objectKind: string;
  grantee: string;
  privilege: string;
};

config({ path: getEnvironmentFilePath() });

const { connectionString } = getRuntimeDatabaseConfig();
const sql = postgres(connectionString, {
  max: 1,
  prepare: false,
});

async function main() {
  const existingRoles = await sql<NameRow[]>`
    select rolname as name
    from pg_roles
    where rolname in ('anon', 'authenticated', 'postgres')
    order by rolname
  `;
  const missingRoles = REQUIRED_DATABASE_ROLES.filter(
    (role) => !existingRoles.some((row) => row.name === role),
  );
  expect(
    missingRoles.length === 0,
    `Missing expected Supabase roles: ${missingRoles.join(", ")}`,
  );

  const publicTables = await sql<NameRow[]>`
    select c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
    order by c.relname
  `;
  const publicTableNames = new Set(publicTables.map((row) => row.name));
  const missingTables = EXPECTED_PUBLIC_TABLES.filter(
    (table) => !publicTableNames.has(table),
  );
  expect(
    missingTables.length === 0,
    `Missing expected public domain tables: ${missingTables.join(", ")}`,
  );

  // Run catalog checks serially because the runtime pooler intentionally keeps
  // a tiny connection budget and this release verifier only needs one session.
  const objectCounts = await getObjectCounts(sql);
  const tablePrivileges = await getTablePrivileges(sql);
  const columnPrivileges = await getColumnPrivileges(sql);
  const sequencePrivileges = await getSequencePrivileges(sql);
  const functionPrivileges = await getFunctionPrivileges(sql);
  const defaultPrivileges = await getUnsafeDefaultPrivileges(sql);

  const objectPrivileges = [
    ...tablePrivileges,
    ...columnPrivileges,
    ...sequencePrivileges,
    ...functionPrivileges,
  ];

  const [{ currentRole }] = await sql<CurrentRoleRow[]>`
    select current_user as "currentRole"
  `;
  expect(
    currentRole !== "anon" && currentRole !== "authenticated",
    `Application database connection unexpectedly uses ${currentRole}.`,
  );

  await verifyApplicationReads(sql);

  expectNoPrivileges("public object", objectPrivileges);
  expectNoDefaultPrivileges(defaultPrivileges);

  const counts = objectCounts[0];
  console.log(
    `Access-control verification passed for ${EXPECTED_PUBLIC_TABLES.length} expected domain tables.`,
  );
  console.log(
    `Checked ${counts.tableCount} public tables/views, ${counts.sequenceCount} sequences, and ${counts.functionCount} functions for anon/authenticated access.`,
  );
  console.log(
    `Verified postgres default privileges and harmless reads through application role ${currentRole}.`,
  );
}

async function getObjectCounts(database: Sql) {
  return database<ObjectCountRow[]>`
    select
      count(*) filter (
        where c.relkind in ('r', 'p', 'v', 'm', 'f')
      )::integer as "tableCount",
      count(*) filter (
        where c.relkind = 'S'
      )::integer as "sequenceCount",
      (
        select count(*)::integer
        from pg_proc p
        join pg_namespace pn on pn.oid = p.pronamespace
        where pn.nspname = 'public'
      ) as "functionCount"
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  `;
}

async function getTablePrivileges(database: Sql) {
  return database<PrivilegeRow[]>`
    with target_roles(role_name) as (
      values ('anon'), ('authenticated')
    ),
    privileges(privilege) as (
      values
        ('SELECT'),
        ('INSERT'),
        ('UPDATE'),
        ('DELETE'),
        ('TRUNCATE'),
        ('REFERENCES'),
        ('TRIGGER')
    ),
    public_relations as materialized (
      select c.oid, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
    )
    select
      roles.role_name as "roleName",
      c.relname as "objectName",
      'table' as "objectKind",
      privileges.privilege
    from target_roles roles
    cross join privileges
    cross join public_relations c
    where has_table_privilege(
      roles.role_name,
      c.oid,
      privileges.privilege
    )
    order by roles.role_name, c.relname, privileges.privilege
  `;
}

async function getColumnPrivileges(database: Sql) {
  return database<PrivilegeRow[]>`
    with target_roles(role_name) as (
      values ('anon'), ('authenticated')
    ),
    privileges(privilege) as (
      values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')
    ),
    public_columns as materialized (
      select c.oid, c.relname, a.attname, a.attnum
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a
        on a.attrelid = c.oid
        and a.attnum > 0
        and not a.attisdropped
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
    )
    select
      roles.role_name as "roleName",
      columns.relname || '.' || columns.attname as "objectName",
      'column' as "objectKind",
      privileges.privilege
    from target_roles roles
    cross join privileges
    cross join public_columns columns
    where has_column_privilege(
        roles.role_name,
        columns.oid,
        columns.attnum,
        privileges.privilege
      )
    order by
      roles.role_name,
      columns.relname,
      columns.attnum,
      privileges.privilege
  `;
}

async function getSequencePrivileges(database: Sql) {
  return database<PrivilegeRow[]>`
    with target_roles(role_name) as (
      values ('anon'), ('authenticated')
    ),
    privileges(privilege) as (
      values ('SELECT'), ('UPDATE'), ('USAGE')
    ),
    public_sequences as materialized (
      select c.oid, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'S'
    )
    select
      roles.role_name as "roleName",
      c.relname as "objectName",
      'sequence' as "objectKind",
      privileges.privilege
    from target_roles roles
    cross join privileges
    cross join public_sequences c
    where has_sequence_privilege(
      roles.role_name,
      c.oid,
      privileges.privilege
    )
    order by roles.role_name, c.relname, privileges.privilege
  `;
}

async function getFunctionPrivileges(database: Sql) {
  return database<PrivilegeRow[]>`
    with target_roles(role_name) as (
      values ('anon'), ('authenticated')
    ),
    public_functions as materialized (
      select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    )
    select
      roles.role_name as "roleName",
      p.oid::regprocedure::text as "objectName",
      'function' as "objectKind",
      'EXECUTE' as privilege
    from target_roles roles
    cross join public_functions p
    where has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
    order by roles.role_name, p.oid::regprocedure::text
  `;
}

async function getUnsafeDefaultPrivileges(database: Sql) {
  return database<DefaultPrivilegeRow[]>`
    with migration_owner as (
      select oid
      from pg_roles
      where rolname = 'postgres'
    ),
    object_types(object_type, object_kind) as (
      values
        ('r'::"char", 'table'),
        ('S'::"char", 'sequence'),
        ('f'::"char", 'function')
    ),
    global_defaults as (
      select
        'global'::text as scope,
        object_types.object_type,
        object_types.object_kind,
        coalesce(
          (
            select defaults.defaclacl
            from pg_default_acl defaults
            where defaults.defaclrole = migration_owner.oid
              and defaults.defaclnamespace = 0
              and defaults.defaclobjtype = object_types.object_type
          ),
          acldefault(object_types.object_type, migration_owner.oid)
        ) as acl
      from migration_owner
      cross join object_types
    ),
    schema_defaults as (
      select
        'public schema'::text as scope,
        object_types.object_type,
        object_types.object_kind,
        coalesce(
          (
            select defaults.defaclacl
            from pg_default_acl defaults
            join pg_namespace n on n.oid = defaults.defaclnamespace
            where defaults.defaclrole = migration_owner.oid
              and n.nspname = 'public'
              and defaults.defaclobjtype = object_types.object_type
          ),
          '{}'::aclitem[]
        ) as acl
      from migration_owner
      cross join object_types
    ),
    expanded as (
      select scope, object_kind, grants.*
      from (
        select * from global_defaults
        union all
        select * from schema_defaults
      ) defaults
      cross join lateral aclexplode(defaults.acl) grants
    )
    select
      expanded.scope,
      expanded.object_kind as "objectKind",
      coalesce(grantee.rolname, 'PUBLIC') as grantee,
      expanded.privilege_type as privilege
    from expanded
    left join pg_roles grantee on grantee.oid = expanded.grantee
    where expanded.grantee = 0
      or grantee.rolname in ('anon', 'authenticated')
    order by expanded.scope, expanded.object_kind, grantee
  `;
}

async function verifyApplicationReads(database: Sql) {
  await database.begin(async (transaction) => {
    for (const table of EXPECTED_PUBLIC_TABLES) {
      await transaction.unsafe(
        `select 1 from "public"."${table}" limit 0`,
      );
    }
  });
}

function expectNoPrivileges(label: string, rows: PrivilegeRow[]) {
  expect(
    rows.length === 0,
    `${label} access remains (${rows.length} grants):\n${formatRows(
      rows.map(
        (row) =>
          `${row.roleName} ${row.privilege} on ${row.objectKind} ${row.objectName}`,
      ),
    )}`,
  );
}

function expectNoDefaultPrivileges(rows: DefaultPrivilegeRow[]) {
  expect(
    rows.length === 0,
    `Unsafe postgres default privileges remain (${rows.length} grants):\n${formatRows(
      rows.map(
        (row) =>
          `${row.grantee} ${row.privilege} on future ${row.objectKind} objects (${row.scope})`,
      ),
    )}`,
  );
}

function formatRows(rows: string[]) {
  const visibleRows = rows.slice(0, 24).map((row) => `- ${row}`);
  if (rows.length > visibleRows.length) {
    visibleRows.push(`- ... ${rows.length - visibleRows.length} more`);
  }
  return visibleRows.join("\n");
}

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
