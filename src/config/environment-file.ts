export const DEFAULT_ENVIRONMENT_FILE = ".env.local";

export function getEnvironmentFilePath(
  environment: Record<string, string | undefined> = process.env,
): string {
  return environment.APP_ENV_FILE?.trim() || DEFAULT_ENVIRONMENT_FILE;
}
