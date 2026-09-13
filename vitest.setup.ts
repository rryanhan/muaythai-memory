import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { configurePostgresTestDatabaseEnvironment } from "@/test-support/postgres-test-database";

// Keep production-module imports inside PostgreSQL suites on the same validated
// disposable database, even when a developer's .env.local points elsewhere.
configurePostgresTestDatabaseEnvironment();

afterEach(() => {
  cleanup();
});
