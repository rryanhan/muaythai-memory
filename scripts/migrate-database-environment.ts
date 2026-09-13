import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  DEPLOYMENT_ENVIRONMENTS,
  type DeploymentEnvironment,
  verifyKnownDeploymentEnvironment,
} from "@/config/deployment-environment";
import { getSupabaseSessionPoolerUrl } from "@/db/connection-config";
import {
  createKnownDeploymentChildEnvironment,
  type KnownDeploymentEnvironment,
  runWithKnownDeploymentEnvironment,
} from "./known-deployment-environment";

const options = parseOptions(process.argv.slice(2));
const environmentFile =
  options.environment === "production"
    ? ".env.production-maintenance.local"
    : ".env.staging.local";

process.exitCode = runWithKnownDeploymentEnvironment(
  {
    expectedEnvironment: options.environment,
    environmentFile,
    errorContext: "migration environment",
  },
  (deployment) => {
    const migrationDeployment = options.useSessionPooler
      ? getSessionPoolerDeployment(deployment)
      : deployment;

    if (options.environment === "production" && !options.confirmProduction) {
      throw new Error(
        "Production migration blocked. Re-run with --confirm-production after staging verification.",
      );
    }

    const result = spawnSync(
      process.execPath,
      [resolve("node_modules/drizzle-kit/bin.cjs"), "migrate"],
      {
        env: createKnownDeploymentChildEnvironment(migrationDeployment),
        stdio: "inherit",
      },
    );
    if (result.error) throw result.error;
    return result.status ?? 1;
  },
);

function getSessionPoolerDeployment(
  deployment: KnownDeploymentEnvironment,
): KnownDeploymentEnvironment {
  const environment = {
    ...deployment.environment,
    DATABASE_DIRECT_URL: getSupabaseSessionPoolerUrl(deployment.environment),
  };
  const summary = verifyKnownDeploymentEnvironment(
    options.environment,
    environment,
  );
  return { ...deployment, environment, summary };
}

function parseOptions(args: string[]): {
  environment: DeploymentEnvironment;
  confirmProduction: boolean;
  useSessionPooler: boolean;
} {
  const environment = args
    .find((argument) => argument.startsWith("--environment="))
    ?.split("=", 2)[1];

  if (
    !environment ||
    !DEPLOYMENT_ENVIRONMENTS.includes(environment as DeploymentEnvironment)
  ) {
    throw new Error("Use --environment=staging or --environment=production.");
  }

  return {
    environment: environment as DeploymentEnvironment,
    confirmProduction: args.includes("--confirm-production"),
    useSessionPooler: args.includes("--use-session-pooler"),
  };
}
