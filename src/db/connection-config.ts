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
  if (isSupabaseSharedPooler(url) && effectivePort(url) !== "6543") {
    throw new Error(
      "DATABASE_POOLER_URL must use Supabase transaction mode on port 6543.",
    );
  }

  const defaultMax = environment.VERCEL ? 1 : 3;
  const maxConnections = parsePoolSize(environment.DATABASE_POOL_MAX, defaultMax);

  return { connectionString, maxConnections };
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
  if (isSupabaseSharedPooler(url)) {
    throw new Error(
      "DATABASE_DIRECT_URL or DATABASE_URL must use a direct database host, not the Supabase pooler.",
    );
  }

  return connectionString;
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
  return url.hostname.endsWith(".pooler.supabase.com");
}

function effectivePort(url: URL): string {
  return url.port || "5432";
}
