import { config } from "dotenv";
import {
  EXPECTED_SUPABASE_PROJECTS,
  type DeploymentEnvironment,
} from "@/config/deployment-environment";
import {
  describeDatabaseUrl,
  getRuntimeDatabaseConfig,
  isSupabaseSharedPoolerHostname,
} from "@/db/connection-config";
import {
  scrubDeploymentSensitiveEnvironment,
  type DeploymentEnvironmentValues as EnvironmentValues,
} from "./known-deployment-environment";

export type DeploymentEnvironmentValues = EnvironmentValues;

export const MAINTENANCE_PROFILES = [
  "development",
  "staging",
  "production",
] as const;

export type MaintenanceProfile = (typeof MAINTENANCE_PROFILES)[number];
export type MaintenanceCapability = "database" | "supabase-admin";

export type MaintenanceOptions = {
  profile: MaintenanceProfile;
  environmentFile: string;
  productionConfirmation?: string;
  operationArgs: string[];
};

export type MaintenanceEnvironment = {
  environment: DeploymentEnvironmentValues;
  environmentFile: string;
  summary: MaintenanceEnvironmentSummary;
};

export type MaintenanceEnvironmentSummary = {
  profile: MaintenanceProfile;
  resolvedTarget: "local" | DeploymentEnvironment;
  projectRef?: string;
  database?: string;
};

type LoadMaintenanceEnvironmentOptions = Omit<
  MaintenanceOptions,
  "operationArgs"
> & {
  capabilities: readonly MaintenanceCapability[];
  errorContext?: string;
};

type RunWithMaintenanceEnvironmentOptions =
  LoadMaintenanceEnvironmentOptions & {
    targetEnvironment?: DeploymentEnvironmentValues;
  };

type TargetIdentity =
  | { kind: "local" }
  | { kind: "hosted"; projectRef: string };

const DEFAULT_ENVIRONMENT_FILES: Record<MaintenanceProfile, string> = {
  development: ".env.local",
  staging: ".env.staging.local",
  production: ".env.production-maintenance.local",
};

const LOOPBACK_HOSTS = new Set([
  "127.0.0.1",
  "::1",
  "[::1]",
  "localhost",
]);

export function parseMaintenanceOptions(args: string[]): MaintenanceOptions {
  let profile: MaintenanceProfile | undefined;
  let environmentFile: string | undefined;
  let productionConfirmation: string | undefined;
  const operationArgs: string[] = [];

  for (const argument of args) {
    if (argument.startsWith("--profile=")) {
      if (profile !== undefined) throw new Error("--profile may only be provided once.");
      const value = argument.slice("--profile=".length);
      if (!MAINTENANCE_PROFILES.includes(value as MaintenanceProfile)) {
        throw new Error(
          "Use --profile=development, --profile=staging, or --profile=production.",
        );
      }
      profile = value as MaintenanceProfile;
      continue;
    }

    if (argument.startsWith("--environment-file=")) {
      if (environmentFile !== undefined) {
        throw new Error("--environment-file may only be provided once.");
      }
      environmentFile = argument.slice("--environment-file=".length).trim();
      if (!environmentFile) {
        throw new Error("--environment-file must not be empty.");
      }
      continue;
    }

    if (argument.startsWith("--confirm-production=")) {
      if (productionConfirmation !== undefined) {
        throw new Error("--confirm-production may only be provided once.");
      }
      productionConfirmation = argument
        .slice("--confirm-production=".length)
        .trim();
      if (!productionConfirmation) {
        throw new Error("--confirm-production must name the production project.");
      }
      continue;
    }

    if (
      argument === "--profile" ||
      argument === "--environment-file" ||
      argument === "--confirm-production"
    ) {
      throw new Error(`${argument} must use the --option=value form.`);
    }

    operationArgs.push(argument);
  }

  const selectedProfile = profile ?? "development";
  if (selectedProfile !== "production" && productionConfirmation !== undefined) {
    throw new Error(
      "--confirm-production is only valid with --profile=production.",
    );
  }

  return {
    profile: selectedProfile,
    environmentFile:
      environmentFile ?? DEFAULT_ENVIRONMENT_FILES[selectedProfile],
    productionConfirmation,
    operationArgs,
  };
}

/** Loads and validates only the selected file. Ambient credentials cannot fill gaps. */
export function loadMaintenanceEnvironment({
  profile,
  environmentFile,
  productionConfirmation,
  capabilities,
  errorContext = "maintenance environment",
}: LoadMaintenanceEnvironmentOptions): MaintenanceEnvironment {
  const environment: DeploymentEnvironmentValues = {};
  const result = config({
    path: environmentFile,
    processEnv: environment,
    override: true,
    quiet: true,
  });
  if (result.error) {
    throw new Error(`Could not load ${errorContext} file ${environmentFile}.`, {
      cause: result.error,
    });
  }
  if (environment.NODE_TLS_REJECT_UNAUTHORIZED !== undefined) {
    throw new Error(
      "Maintenance environment files must not set NODE_TLS_REJECT_UNAUTHORIZED.",
    );
  }

  const uniqueCapabilities = new Set(capabilities);
  if (uniqueCapabilities.size === 0) {
    throw new Error("At least one maintenance capability is required.");
  }

  const databaseConnectionString = uniqueCapabilities.has("database")
    ? requireValue(environment, "DATABASE_POOLER_URL")
    : undefined;
  const databaseIdentity = databaseConnectionString
    ? getDatabaseTargetIdentity(databaseConnectionString)
    : undefined;
  const databaseConfig = databaseConnectionString
    ? getRuntimeDatabaseConfig(environment)
    : undefined;
  const supabaseIdentity = uniqueCapabilities.has("supabase-admin")
    ? getSupabaseTargetIdentity(
        requireValue(environment, "NEXT_PUBLIC_SUPABASE_URL"),
      )
    : undefined;
  if (uniqueCapabilities.has("supabase-admin")) {
    requireValue(environment, "SUPABASE_SERVICE_ROLE_KEY");
  }

  const targetIdentity = reconcileTargetIdentities(
    databaseIdentity,
    supabaseIdentity,
  );
  const summary = validateProfileTarget(
    profile,
    targetIdentity,
    environment,
    productionConfirmation,
  );

  return {
    environment,
    environmentFile,
    summary: {
      ...summary,
      database: databaseConfig
        ? describeDatabaseUrl(databaseConfig.connectionString)
        : undefined,
    },
  };
}

export function installMaintenanceEnvironment(
  maintenance: MaintenanceEnvironment,
  targetEnvironment: DeploymentEnvironmentValues = process.env,
): void {
  scrubDeploymentSensitiveEnvironment(targetEnvironment);
  for (const [name, value] of Object.entries(maintenance.environment)) {
    if (value !== undefined) targetEnvironment[name] = value;
  }
  targetEnvironment.APP_ENV_FILE = maintenance.environmentFile;
}

/** Validates and installs the target before environment-bound work can start. */
export async function runWithMaintenanceEnvironment<Result>(
  {
    targetEnvironment = process.env,
    ...options
  }: RunWithMaintenanceEnvironmentOptions,
  operation: (maintenance: MaintenanceEnvironment) => Promise<Result> | Result,
): Promise<Result> {
  const maintenance = loadMaintenanceEnvironment(options);
  installMaintenanceEnvironment(maintenance, targetEnvironment);
  return operation(maintenance);
}

export function formatMaintenancePreflight(
  operationName: string,
  maintenance: MaintenanceEnvironment,
): string {
  const { profile, resolvedTarget, projectRef } = maintenance.summary;
  const target = projectRef
    ? `${resolvedTarget} Supabase project ${projectRef}`
    : "local loopback Supabase";
  return `${operationName}: ${profile} profile resolves to ${target} via ${maintenance.environmentFile}.`;
}

function getSupabaseTargetIdentity(value: string): TargetIdentity {
  const url = parseUrl(value, "NEXT_PUBLIC_SUPABASE_URL");
  if (
    url.username ||
    url.password ||
    (url.pathname && url.pathname !== "/") ||
    url.search ||
    url.hash
  ) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a canonical project origin.");
  }
  if (LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(
        "A loopback NEXT_PUBLIC_SUPABASE_URL must use HTTP or HTTPS.",
      );
    }
    return { kind: "local" };
  }
  if (url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS for a hosted project.");
  }
  if (url.port) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a canonical project origin.");
  }

  const projectRef = /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname)?.[1];
  if (!projectRef) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must identify a Supabase project or a loopback development service.",
    );
  }
  return { kind: "hosted", projectRef };
}

function getDatabaseTargetIdentity(connectionString: string): TargetIdentity {
  const url = parseUrl(connectionString, "DATABASE_POOLER_URL");
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(
      "DATABASE_POOLER_URL must be a valid PostgreSQL connection URL.",
    );
  }
  if (
    !url.username ||
    !url.password ||
    !url.hostname ||
    !url.port ||
    !url.pathname ||
    url.pathname === "/"
  ) {
    throw new Error(
      "DATABASE_POOLER_URL must include an explicit username, password, host, port, and database name.",
    );
  }
  const hostname = url.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(hostname)) return { kind: "local" };

  const directProjectRef = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(
    hostname,
  )?.[1];
  if (directProjectRef && url.port !== "5432") {
    throw new Error(
      "A direct Supabase DATABASE_POOLER_URL must use port 5432.",
    );
  }
  const poolerProjectRef = isSupabaseSharedPoolerHostname(hostname)
    ? /^postgres\.([a-z0-9]+)$/i.exec(decodeURIComponent(url.username))?.[1]
    : undefined;
  const projectRef = directProjectRef ?? poolerProjectRef;
  if (!projectRef) {
    throw new Error(
      "DATABASE_POOLER_URL must identify a Supabase project or a loopback development database.",
    );
  }
  return { kind: "hosted", projectRef };
}

function reconcileTargetIdentities(
  databaseIdentity: TargetIdentity | undefined,
  supabaseIdentity: TargetIdentity | undefined,
): TargetIdentity {
  const identity = databaseIdentity ?? supabaseIdentity;
  if (!identity) throw new Error("No maintenance target could be identified.");
  if (!databaseIdentity || !supabaseIdentity) return identity;

  if (
    databaseIdentity.kind !== supabaseIdentity.kind ||
    (databaseIdentity.kind === "hosted" &&
      supabaseIdentity.kind === "hosted" &&
      databaseIdentity.projectRef !== supabaseIdentity.projectRef)
  ) {
    throw new Error(
      "DATABASE_POOLER_URL and NEXT_PUBLIC_SUPABASE_URL must identify the same target.",
    );
  }
  return identity;
}

function validateProfileTarget(
  profile: MaintenanceProfile,
  identity: TargetIdentity,
  environment: DeploymentEnvironmentValues,
  productionConfirmation: string | undefined,
): Omit<MaintenanceEnvironmentSummary, "database"> {
  const marker = environment.DEPLOYMENT_ENVIRONMENT?.trim() || undefined;
  if (profile === "development") {
    if (identity.kind === "local") {
      if (marker !== undefined) {
        throw new Error(
          "A loopback development target must not declare DEPLOYMENT_ENVIRONMENT.",
        );
      }
      return { profile, resolvedTarget: "local" };
    }

    if (identity.projectRef === EXPECTED_SUPABASE_PROJECTS.production) {
      throw new Error("The development profile may never target production.");
    }
    if (identity.projectRef !== EXPECTED_SUPABASE_PROJECTS.staging) {
      throw new Error(
        `The development profile may target only loopback services or staging project ${EXPECTED_SUPABASE_PROJECTS.staging}.`,
      );
    }
    if (marker !== undefined && marker !== "staging") {
      throw new Error(
        `The development profile resolved to staging but declares ${marker}.`,
      );
    }
    return {
      profile,
      resolvedTarget: "staging",
      projectRef: identity.projectRef,
    };
  }

  if (identity.kind === "local") {
    throw new Error(`The ${profile} profile may not target loopback services.`);
  }
  if (marker !== profile) {
    throw new Error(
      `Expected ${profile} configuration, received ${marker ?? "no DEPLOYMENT_ENVIRONMENT"}.`,
    );
  }

  const expectedProjectRef = EXPECTED_SUPABASE_PROJECTS[profile];
  if (identity.projectRef !== expectedProjectRef) {
    throw new Error(
      `Expected ${profile} Supabase project ${expectedProjectRef}, received ${identity.projectRef}.`,
    );
  }
  if (
    profile === "production" &&
    productionConfirmation !== expectedProjectRef
  ) {
    throw new Error(
      `Production maintenance requires --confirm-production=${expectedProjectRef}.`,
    );
  }

  return {
    profile,
    resolvedTarget: profile,
    projectRef: identity.projectRef,
  };
}

function requireValue(
  environment: DeploymentEnvironmentValues,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseUrl(value: string, label: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
}
