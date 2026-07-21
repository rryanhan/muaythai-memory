import { config } from "dotenv";
import {
  DEPLOYMENT_ENVIRONMENTS,
  type DeploymentEnvironment,
  verifyDeploymentEnvironment,
} from "@/config/deployment-environment";
import { getEnvironmentFilePath } from "@/config/environment-file";

const expectedEnvironment = parseExpectedEnvironment(process.argv.slice(2));
const environmentFile = getEnvironmentFilePath();

config({ path: environmentFile });

const summary = verifyDeploymentEnvironment(expectedEnvironment);

console.log(`Environment: ${summary.environment}`);
console.log(`App origin: ${summary.appOrigin}`);
console.log(`Supabase project: ${summary.projectRef}`);
console.log(`Runtime database: ${summary.runtimeDatabase}`);
console.log(`Migration database: ${summary.migrationDatabase}`);
console.log(`${environmentFile} is internally consistent.`);

function parseExpectedEnvironment(args: string[]): DeploymentEnvironment {
  const value = args.find((argument) => argument.startsWith("--expect="))
    ?.split("=", 2)[1];

  if (
    !value ||
    !DEPLOYMENT_ENVIRONMENTS.includes(value as DeploymentEnvironment)
  ) {
    throw new Error("Use --expect=staging or --expect=production.");
  }

  return value as DeploymentEnvironment;
}
