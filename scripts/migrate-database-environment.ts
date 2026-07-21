import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import {
  DEPLOYMENT_ENVIRONMENTS,
  type DeploymentEnvironment,
  verifyDeploymentEnvironment,
} from "@/config/deployment-environment";

const options = parseOptions(process.argv.slice(2));
const environmentFile =
  options.environment === "production"
    ? ".env.production-maintenance.local"
    : ".env.staging.local";

process.env.APP_ENV_FILE = environmentFile;
config({ path: environmentFile });
verifyDeploymentEnvironment(options.environment);

if (options.environment === "production" && !options.confirmProduction) {
  throw new Error(
    "Production migration blocked. Re-run with --confirm-production after staging verification.",
  );
}

const result = spawnSync(
  process.platform === "win32"
    ? "node_modules/.bin/drizzle-kit.cmd"
    : "node_modules/.bin/drizzle-kit",
  ["migrate"],
  {
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

function parseOptions(args: string[]): {
  environment: DeploymentEnvironment;
  confirmProduction: boolean;
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
  };
}
