const PRIMARY_DATABASE_URL_VARIABLE = "POSTGRES_TEST_DATABASE_URL";
const LEGACY_DATABASE_URL_VARIABLE = "JOURNAL_TEST_DATABASE_URL";
const TEST_DATABASE_NAME_MARKER = "muaythai_pr6_test";
const TEST_DATABASE_NAME_PATTERN = /^muaythai_pr6_test(?:_[a-z0-9_]+)?$/i;

type TestEnvironment = Record<string, string | undefined>;

export function resolvePostgresTestDatabaseUrl(
  environment: TestEnvironment = process.env,
): string | undefined {
  const primaryUrl = environment[PRIMARY_DATABASE_URL_VARIABLE]?.trim();
  const legacyUrl = environment[LEGACY_DATABASE_URL_VARIABLE]?.trim();

  if (primaryUrl && legacyUrl && primaryUrl !== legacyUrl) {
    throw new Error(
      `${PRIMARY_DATABASE_URL_VARIABLE} and legacy ${LEGACY_DATABASE_URL_VARIABLE} must match when both are set.`,
    );
  }

  return primaryUrl || legacyUrl;
}

export function configurePostgresTestDatabaseEnvironment(
  environment: TestEnvironment = process.env,
): string | undefined {
  const databaseUrl = resolvePostgresTestDatabaseUrl(environment);
  if (!databaseUrl) return undefined;

  assertLoopbackPostgresTestDatabase(databaseUrl);
  environment[PRIMARY_DATABASE_URL_VARIABLE] = databaseUrl;
  environment.DATABASE_POOLER_URL = databaseUrl;
  return databaseUrl;
}

export function assertLoopbackPostgresTestDatabase(value: string): void {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw invalidTestDatabaseUrlError();
  }

  const hostname = url.hostname.toLowerCase();
  const databaseName = url.pathname.slice(1);
  const isLoopback = hostname === "127.0.0.1"
    || hostname === "localhost"
    || hostname === "::1"
    || hostname === "[::1]";
  const isPostgres = url.protocol === "postgres:" || url.protocol === "postgresql:";

  if (!isPostgres || !isLoopback || !TEST_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw invalidTestDatabaseUrlError();
  }
}

function invalidTestDatabaseUrlError(): Error {
  return new Error(
    `${PRIMARY_DATABASE_URL_VARIABLE} (or legacy ${LEGACY_DATABASE_URL_VARIABLE}) must target a loopback PostgreSQL database named ${TEST_DATABASE_NAME_MARKER} or ${TEST_DATABASE_NAME_MARKER}_<suffix>.`,
  );
}
