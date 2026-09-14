type DatabaseEnvironment = Record<string, string | undefined>;

export type RuntimeDatabaseConfig = {
  connectionString: string;
  maxConnections: number;
};

export function getRuntimeDatabaseConfig(
  environment: DatabaseEnvironment = process.env,
): RuntimeDatabaseConfig {
  const connectionString = environment.DATABASE_POOLER_URL?.trim();

  if (!connectionString) {
    throw new Error(
      "DATABASE_POOLER_URL is required for application database traffic.",
    );
  }

  const url = parseDatabaseUrl(connectionString, "DATABASE_POOLER_URL");
  let runtimeConnectionString = connectionString;
  if (isSupabaseSharedPooler(url)) {
    if (effectivePort(url) !== "6543") {
      throw new Error(
        "DATABASE_POOLER_URL must use Supabase transaction mode on port 6543.",
      );
    }

    runtimeConnectionString = requireSupabaseTls(url, "DATABASE_POOLER_URL");
  } else if (isSupabaseDirectDatabase(url)) {
    if (effectivePort(url) !== "5432") {
      throw new Error(
        "DATABASE_POOLER_URL must use Supabase direct database hosts on port 5432.",
      );
    }

    runtimeConnectionString = requireSupabaseTls(url, "DATABASE_POOLER_URL");
  }

  const defaultMax = environment.VERCEL ? 1 : 3;
  const maxConnections = parsePoolSize(environment.DATABASE_POOL_MAX, defaultMax);

  return { connectionString: runtimeConnectionString, maxConnections };
}

export function getMigrationDatabaseUrl(
  environment: DatabaseEnvironment = process.env,
): string {
  const connectionString =
    environment.DATABASE_DIRECT_URL?.trim() || environment.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error(
      "DATABASE_DIRECT_URL or legacy DATABASE_URL is required for migrations.",
    );
  }

  const url = parseDatabaseUrl(
    connectionString,
    "DATABASE_DIRECT_URL or DATABASE_URL",
  );
  if (isSupabaseSharedPooler(url) || isSupabaseDirectDatabase(url)) {
    if (effectivePort(url) !== "5432") {
      throw new Error(
        "DATABASE_DIRECT_URL or DATABASE_URL must use a direct database host or Supabase session mode on port 5432.",
      );
    }

    return requireSupabaseTls(url, "DATABASE_DIRECT_URL or DATABASE_URL");
  }

  return connectionString;
}

export function getSupabaseSessionPoolerUrl(
  environment: DatabaseEnvironment = process.env,
): string {
  const { connectionString } = getRuntimeDatabaseConfig(environment);
  const url = parseDatabaseUrl(connectionString, "DATABASE_POOLER_URL");
  if (!isSupabaseSharedPooler(url)) {
    throw new Error(
      "A Supabase pooler URL is required to derive a session-mode migration connection.",
    );
  }

  url.port = "5432";
  return url.toString();
}

export function describeDatabaseUrl(connectionString: string): string {
  const url = parseDatabaseUrl(connectionString, "database URL");
  return `${url.hostname}:${effectivePort(url)}`;
}

function parsePoolSize(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
    throw new Error("DATABASE_POOL_MAX must be an integer from 1 through 10.");
  }

  return parsed;
}

function parseDatabaseUrl(value: string, label: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      throw new Error("unsupported protocol");
    }
    return url;
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL connection URL.`);
  }
}

function isSupabaseSharedPooler(url: URL): boolean {
  return isSupabaseSharedPoolerHostname(url.hostname);
}

function isSupabaseDirectDatabase(url: URL): boolean {
  return /^db\.[a-z0-9]+\.supabase\.co$/i.test(url.hostname);
}

const SECURE_SUPABASE_SSL_MODES = new Set([
  "require",
  "verify-ca",
  "verify-full",
]);

function requireSupabaseTls(url: URL, label: string): string {
  const sslModeParameters = [...url.searchParams].filter(
    ([name]) => name.toLowerCase() === "sslmode",
  );

  if (sslModeParameters.length > 1) {
    throw new Error(`${label} must include at most one sslmode parameter.`);
  }

  const sslModeParameter = sslModeParameters[0];
  if (!sslModeParameter) {
    url.searchParams.append("sslmode", "require");
    return url.toString();
  }

  const [name, mode] = sslModeParameter;
  if (name !== "sslmode" || !SECURE_SUPABASE_SSL_MODES.has(mode)) {
    throw new Error(
      `${label} sslmode must be require, verify-ca, or verify-full.`,
    );
  }

  return url.toString();
}

/** Accepts one canonical Supabase pooler host, never postgres.js multi-host syntax. */
export function isSupabaseSharedPoolerHostname(hostname: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.pooler\.supabase\.com$/i.test(
    hostname,
  );
}

function effectivePort(url: URL): string {
  return url.port || "5432";
}
