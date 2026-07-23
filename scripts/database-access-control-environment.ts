import { config } from "dotenv";
import {
  DEPLOYMENT_ENVIRONMENTS,
  type DeploymentEnvironment,
  type DeploymentEnvironmentSummary,
  verifyDeploymentEnvironment,
} from "@/config/deployment-environment";

type EnvironmentValues = Record<string, string | undefined>;

const DEFAULT_ENVIRONMENT_FILES: Record<DeploymentEnvironment, string> = {
  staging: ".env.staging.local",
  production: ".env.production-maintenance.local",
};
const EXPECTED_SUPABASE_PROJECTS: Record<DeploymentEnvironment, string> = {
  staging: "seiroxntlvyudgvseyss",
  production: "pbzqwvowkpfhxptvmrny",
};

export type AccessControlEnvironment = {
  environment: EnvironmentValues;
  environmentFile: string;
  summary: DeploymentEnvironmentSummary;
};

export function loadAccessControlEnvironment(
  args: string[],
  ambientEnvironment: EnvironmentValues = process.env,
): AccessControlEnvironment {
  const options = parseAccessControlOptions(args);
  const environmentFile =
    options.environmentFile ??
    DEFAULT_ENVIRONMENT_FILES[options.expectedEnvironment];
  // Start from a safe allowlist rather than merging deployment credentials
  // from the shell. A missing file value must fail instead of silently falling
  // back to a potentially different project's ambient secret.
  const environment: EnvironmentValues = {
    NODE_ENV: ambientEnvironment.NODE_ENV,
  };

  const result = config({
    path: environmentFile,
    processEnv: environment,
    override: true,
    quiet: true,
  });
  if (result.error) {
    throw new Error(
      `Could not load access-control environment file ${environmentFile}.`,
      { cause: result.error },
    );
  }

  const summary = verifyDeploymentEnvironment(
    options.expectedEnvironment,
    environment,
  );
  const expectedProject =
    EXPECTED_SUPABASE_PROJECTS[options.expectedEnvironment];
  if (summary.projectRef !== expectedProject) {
    throw new Error(
      `Expected ${options.expectedEnvironment} Supabase project ${expectedProject}, received ${summary.projectRef}.`,
    );
  }

  return { environment, environmentFile, summary };
}

export function parseAccessControlOptions(args: string[]): {
  expectedEnvironment: DeploymentEnvironment;
  environmentFile?: string;
} {
  const expectedEnvironment = readOption(args, "--expect");
  if (
    !expectedEnvironment ||
    !DEPLOYMENT_ENVIRONMENTS.includes(
      expectedEnvironment as DeploymentEnvironment,
    )
  ) {
    throw new Error(
      "Use --expect=staging or --expect=production.",
    );
  }

  const environmentFile = readOption(args, "--env-file");
  const supportedArguments = args.filter(
    (argument) =>
      argument.startsWith("--expect=") ||
      argument.startsWith("--env-file="),
  );
  if (supportedArguments.length !== args.length) {
    throw new Error(
      "Supported options are --expect=staging|production and --env-file=<path>.",
    );
  }
  if (environmentFile !== undefined && !environmentFile.trim()) {
    throw new Error("--env-file must not be empty.");
  }

  return {
    expectedEnvironment: expectedEnvironment as DeploymentEnvironment,
    environmentFile,
  };
}

function readOption(args: string[], name: string): string | undefined {
  const matchingArguments = args.filter((argument) =>
    argument.startsWith(`${name}=`),
  );
  if (matchingArguments.length > 1) {
    throw new Error(`${name} may only be provided once.`);
  }
  return matchingArguments[0]?.slice(name.length + 1);
}
