import { describe, expect, it } from "vitest";
import {
  assertLoopbackPostgresTestDatabase,
  configurePostgresTestDatabaseEnvironment,
  resolvePostgresTestDatabaseUrl,
} from "./postgres-test-database";

describe("PostgreSQL test database configuration", () => {
  const genericUrl = "postgresql://postgres:postgres@127.0.0.1:5432/muaythai_pr6_test";
  const legacyUrl = "postgresql://postgres:postgres@localhost:5432/muaythai_pr6_test_legacy";

  it("prefers the generic environment variable", () => {
    expect(resolvePostgresTestDatabaseUrl({
      POSTGRES_TEST_DATABASE_URL: `  ${genericUrl}  `,
    })).toBe(genericUrl);
  });

  it("keeps the journal-specific variable as a compatibility fallback", () => {
    expect(resolvePostgresTestDatabaseUrl({
      JOURNAL_TEST_DATABASE_URL: `  ${legacyUrl}  `,
    })).toBe(legacyUrl);
  });

  it("returns undefined when neither variable is configured", () => {
    expect(resolvePostgresTestDatabaseUrl({})).toBeUndefined();
  });

  it("accepts matching generic and legacy values", () => {
    expect(resolvePostgresTestDatabaseUrl({
      JOURNAL_TEST_DATABASE_URL: genericUrl,
      POSTGRES_TEST_DATABASE_URL: genericUrl,
    })).toBe(genericUrl);
  });

  it("rejects conflicting generic and legacy values without exposing either URL", () => {
    expect(() => resolvePostgresTestDatabaseUrl({
      JOURNAL_TEST_DATABASE_URL: legacyUrl,
      POSTGRES_TEST_DATABASE_URL: genericUrl,
    })).toThrow(
      "POSTGRES_TEST_DATABASE_URL and legacy JOURNAL_TEST_DATABASE_URL must match when both are set.",
    );
  });

  it("pins application database imports to the validated isolated database", () => {
    const environment = {
      JOURNAL_TEST_DATABASE_URL: legacyUrl,
      DATABASE_POOLER_URL: "postgresql://hosted.example.com:5432/production",
    };

    expect(configurePostgresTestDatabaseEnvironment(environment)).toBe(legacyUrl);
    expect(environment).toMatchObject({
      DATABASE_POOLER_URL: legacyUrl,
      JOURNAL_TEST_DATABASE_URL: legacyUrl,
      POSTGRES_TEST_DATABASE_URL: legacyUrl,
    });
  });

  it.each([
    "postgresql://postgres:postgres@127.0.0.1:5432/muaythai_pr6_test",
    "postgresql://postgres:postgres@localhost:5432/muaythai_pr6_test_ci",
    "postgresql://postgres:postgres@[::1]:5432/muaythai_pr6_test",
  ])("accepts an isolated loopback test database: %s", (databaseUrl) => {
    expect(() => assertLoopbackPostgresTestDatabase(databaseUrl)).not.toThrow();
  });

  it.each([
    "not-a-url",
    "https://localhost/muaythai_pr6_test",
    "postgresql://postgres:postgres@db.example.com:5432/muaythai_pr6_test",
    "postgresql://postgres:postgres@127.0.0.1:5432/muaythai_development",
    "postgresql://postgres:postgres@127.0.0.1:5432/production_muaythai_pr6_test_backup",
  ])("rejects an unsafe test database URL: %s", (databaseUrl) => {
    expect(() => assertLoopbackPostgresTestDatabase(databaseUrl)).toThrow(
      "POSTGRES_TEST_DATABASE_URL (or legacy JOURNAL_TEST_DATABASE_URL) must target a loopback PostgreSQL database named muaythai_pr6_test or muaythai_pr6_test_<suffix>.",
    );
  });
});
