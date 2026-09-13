import {
  DEPLOYMENT_ENVIRONMENTS,
  type DeploymentEnvironment,
  type DeploymentEnvironmentSummary,
} from "@/config/deployment-environment";
import { loadKnownDeploymentEnvironment } from "./known-deployment-environment";

type EnvironmentValues = Record<string, string | undefined>;

const DEFAULT_ENVIRONMENT_FILES: Record<DeploymentEnvironment, string> = {
  staging: ".env.staging.local",
  production: ".env.production-maintenance.local",
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
  const { environment, summary } = loadKnownDeploymentEnvironment({
    expectedEnvironment: options.expectedEnvironment,
    environmentFile,
    ambientEnvironment,
    errorContext: "access-control environment",
  });

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
