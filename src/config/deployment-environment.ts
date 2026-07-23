import {
  describeDatabaseUrl,
  getMigrationDatabaseUrl,
  getRuntimeDatabaseConfig,
} from "@/db/connection-config";

export const DEPLOYMENT_ENVIRONMENTS = ["staging", "production"] as const;

export type DeploymentEnvironment =
  (typeof DEPLOYMENT_ENVIRONMENTS)[number];

type EnvironmentValues = Record<string, string | undefined>;

export type DeploymentEnvironmentSummary = {
  environment: DeploymentEnvironment;
  appOrigin: string;
  projectRef: string;
  runtimeDatabase: string;
  migrationDatabase: string;
};

export function verifyDeploymentEnvironment(
  expectedEnvironment: DeploymentEnvironment,
  environment: EnvironmentValues = process.env,
): DeploymentEnvironmentSummary {
  const configuredEnvironment = requireValue(
    environment,
    "DEPLOYMENT_ENVIRONMENT",
  );
  if (configuredEnvironment !== expectedEnvironment) {
    throw new Error(
      `Expected ${expectedEnvironment} configuration, received ${configuredEnvironment}.`,
    );
  }

  const appUrl = parseHttpsUrl(
    requireValue(environment, "NEXT_PUBLIC_APP_URL"),
    "NEXT_PUBLIC_APP_URL",
  );
  const supabaseUrl = parseHttpsUrl(
    requireValue(environment, "NEXT_PUBLIC_SUPABASE_URL"),
    "NEXT_PUBLIC_SUPABASE_URL",
  );
  const projectRef = getSupabaseProjectRef(supabaseUrl);

  requireValue(environment, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  requireValue(environment, "SUPABASE_SERVICE_ROLE_KEY");
  const authFlowSecret = requireValue(environment, "AUTH_FLOW_SECRET");
  if (Buffer.byteLength(authFlowSecret, "utf8") < 32) {
    throw new Error("AUTH_FLOW_SECRET must contain at least 32 bytes.");
  }

  const runtime = getRuntimeDatabaseConfig(environment);
  const migrationUrl = getMigrationDatabaseUrl(environment);
  assertDatabaseProject(runtime.connectionString, projectRef, "DATABASE_POOLER_URL");
  assertDatabaseProject(
    migrationUrl,
    projectRef,
    "DATABASE_DIRECT_URL or DATABASE_URL",
  );

  return {
    environment: expectedEnvironment,
    appOrigin: appUrl.origin,
    projectRef,
    runtimeDatabase: describeDatabaseUrl(runtime.connectionString),
    migrationDatabase: describeDatabaseUrl(migrationUrl),
  };
}

function requireValue(environment: EnvironmentValues, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function parseHttpsUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS for hosted environments.`);
  }
  return url;
}

function getSupabaseProjectRef(url: URL): string {
  const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
  if (!match) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must use the project's Supabase URL.",
    );
  }
  return match[1];
}

function assertDatabaseProject(
  connectionString: string,
  projectRef: string,
  label: string,
) {
  const url = new URL(connectionString);
  const username = decodeURIComponent(url.username);
  const directProjectRef = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(
    url.hostname,
  )?.[1];
  const pooledProjectRef = /^postgres\.([a-z0-9]+)$/i.exec(username)?.[1];
  const databaseProjectRef = directProjectRef ?? pooledProjectRef;

  if (!databaseProjectRef || databaseProjectRef !== projectRef) {
    throw new Error(
      `${label} does not belong to Supabase project ${projectRef}.`,
    );
  }
}
