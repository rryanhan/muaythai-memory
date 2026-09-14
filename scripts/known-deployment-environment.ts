import { config } from "dotenv";
import {
  type DeploymentEnvironment,
  type DeploymentEnvironmentSummary,
  verifyKnownDeploymentEnvironment,
} from "@/config/deployment-environment";

export type DeploymentEnvironmentValues = Record<string, string | undefined>;

export type KnownDeploymentEnvironment = {
  environment: DeploymentEnvironmentValues;
  environmentFile: string;
  summary: DeploymentEnvironmentSummary;
};

const DEPLOYMENT_SENSITIVE_ENVIRONMENT_KEYS = [
  "APP_ENV_FILE",
  "AUTH_FLOW_SECRET",
  "DATABASE_DIRECT_URL",
  "DATABASE_POOLER_URL",
  "DATABASE_POOL_MAX",
  "DATABASE_URL",
  "DEPLOYMENT_ENVIRONMENT",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "PGDATABASE",
  "PGHOST",
  "PGHOSTADDR",
  "PGPASSWORD",
  "PGPORT",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGSSL",
  "PGSSLMODE",
  "PGUSER",
  "PGUSERNAME",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TEST_USER_PASSWORD",
] as const;

type LoadKnownDeploymentEnvironmentOptions = {
  expectedEnvironment: DeploymentEnvironment;
  environmentFile: string;
  ambientEnvironment?: DeploymentEnvironmentValues;
  errorContext?: string;
};

/** Loads and validates only the selected file, without ambient credential fallback. */
export function loadKnownDeploymentEnvironment({
  expectedEnvironment,
  environmentFile,
  ambientEnvironment = process.env,
  errorContext = "environment",
}: LoadKnownDeploymentEnvironmentOptions): KnownDeploymentEnvironment {
  const environment: DeploymentEnvironmentValues = {};
  if (ambientEnvironment.NODE_ENV !== undefined) {
    environment.NODE_ENV = ambientEnvironment.NODE_ENV;
  }
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

  const summary = verifyKnownDeploymentEnvironment(
    expectedEnvironment,
    environment,
  );
  return { environment, environmentFile, summary };
}

/** Ensures target validation completes before invoking environment-bound work. */
export function runWithKnownDeploymentEnvironment<Result>(
  options: LoadKnownDeploymentEnvironmentOptions,
  operation: (loaded: KnownDeploymentEnvironment) => Result,
): Result {
  return operation(loadKnownDeploymentEnvironment(options));
}

/** Replaces target-selecting values while preserving unrelated process settings. */
export function installKnownDeploymentEnvironment(
  deployment: KnownDeploymentEnvironment,
  targetEnvironment: DeploymentEnvironmentValues = process.env,
): void {
  scrubDeploymentSensitiveEnvironment(targetEnvironment);
  for (const [name, value] of Object.entries(deployment.environment)) {
    if (value !== undefined) targetEnvironment[name] = value;
  }
  targetEnvironment.APP_ENV_FILE = deployment.environmentFile;
}

/** Creates a child environment without ambient deployment credential fallback. */
export function createKnownDeploymentChildEnvironment(
  deployment: KnownDeploymentEnvironment,
  ambientEnvironment: DeploymentEnvironmentValues = process.env,
): NodeJS.ProcessEnv {
  const childEnvironment = { ...ambientEnvironment };
  scrubDeploymentSensitiveEnvironment(childEnvironment);
  const childEnvironmentWithSelectedTarget = {
    ...childEnvironment,
    ...deployment.environment,
    APP_ENV_FILE: deployment.environmentFile,
  };

  // Next's global types require NODE_ENV even though Node permits it to be
  // absent from a child environment.
  return childEnvironmentWithSelectedTarget as unknown as NodeJS.ProcessEnv;
}

export function scrubDeploymentSensitiveEnvironment(
  environment: DeploymentEnvironmentValues,
): void {
  for (const key of DEPLOYMENT_SENSITIVE_ENVIRONMENT_KEYS) {
    delete environment[key];
  }
}
