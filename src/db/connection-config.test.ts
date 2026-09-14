import { describe, expect, it } from "vitest";
import {
  getRuntimeDatabaseConfig,
  getSupabaseSessionPoolerUrl,
} from "./connection-config";

const SUPABASE_POOLER_URL =
  "postgresql://postgres.project-ref:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres";

describe("getRuntimeDatabaseConfig", () => {
  it("defaults canonical Supabase transaction-pooler connections to required TLS", () => {
    const connectionString = `${SUPABASE_POOLER_URL}?application_name=muaythai-memory`;

    const config = getRuntimeDatabaseConfig({
      DATABASE_POOLER_URL: connectionString,
    });

    const normalized = new URL(config.connectionString);
    expect(normalized.searchParams.get("application_name")).toBe(
      "muaythai-memory",
    );
    expect(normalized.searchParams.getAll("sslmode")).toEqual(["require"]);
    expect(config.maxConnections).toBe(3);
  });

  it.each(["require", "verify-ca", "verify-full"])(
    "allows the secure Supabase sslmode %s",
    (sslmode) => {
      const connectionString = `${SUPABASE_POOLER_URL}?sslmode=${sslmode}`;

      expect(
        getRuntimeDatabaseConfig({ DATABASE_POOLER_URL: connectionString })
          .connectionString,
      ).toBe(connectionString);
    },
  );

  it.each(["disable", "allow", "prefer", "false"])(
    "rejects the plaintext-capable Supabase sslmode %s",
    (sslmode) => {
      expect(() =>
        getRuntimeDatabaseConfig({
          DATABASE_POOLER_URL: `${SUPABASE_POOLER_URL}?sslmode=${sslmode}`,
        }),
      ).toThrow(
        "DATABASE_POOLER_URL sslmode must be require, verify-ca, or verify-full.",
      );
    },
  );

  it("rejects unsupported Supabase sslmode values", () => {
    expect(() =>
      getRuntimeDatabaseConfig({
        DATABASE_POOLER_URL: `${SUPABASE_POOLER_URL}?sslmode=true`,
      }),
    ).toThrow(
      "DATABASE_POOLER_URL sslmode must be require, verify-ca, or verify-full.",
    );
  });

  it.each([
    "sslmode=require&sslmode=require",
    "sslmode=require&sslmode=disable",
    "sslmode=require&SSLMODE=verify-full",
  ])("rejects ambiguous duplicate sslmode parameters: %s", (query) => {
    expect(() =>
      getRuntimeDatabaseConfig({
        DATABASE_POOLER_URL: `${SUPABASE_POOLER_URL}?${query}`,
      }),
    ).toThrow(
      "DATABASE_POOLER_URL must include at most one sslmode parameter.",
    );
  });

  it("rejects noncanonical sslmode casing instead of letting the driver ignore it", () => {
    expect(() =>
      getRuntimeDatabaseConfig({
        DATABASE_POOLER_URL: `${SUPABASE_POOLER_URL}?SSLMODE=require`,
      }),
    ).toThrow(
      "DATABASE_POOLER_URL sslmode must be require, verify-ca, or verify-full.",
    );
  });

  it.each([
    SUPABASE_POOLER_URL.replace(":6543/", ":5432/"),
    SUPABASE_POOLER_URL.replace(":6543", ""),
  ])("requires Supabase transaction mode on port 6543: %s", (connectionString) => {
    expect(() =>
      getRuntimeDatabaseConfig({ DATABASE_POOLER_URL: connectionString }),
    ).toThrow(
      "DATABASE_POOLER_URL must use Supabase transaction mode on port 6543.",
    );
  });

  it.each([
    "postgresql://postgres:password@localhost:5432/muaythai?sslmode=disable",
    "postgresql://postgres:password@db.example.com:5432/muaythai",
    "postgresql://postgres:password@pooler.supabase.com.evil.example:5432/muaythai?sslmode=prefer",
  ])("preserves non-Supabase runtime URLs byte-for-byte: %s", (connectionString) => {
    expect(
      getRuntimeDatabaseConfig({ DATABASE_POOLER_URL: connectionString })
        .connectionString,
    ).toBe(connectionString);
  });
});

describe("getSupabaseSessionPoolerUrl", () => {
  it("carries the required TLS default into a derived session-pooler URL", () => {
    const sessionUrl = new URL(
      getSupabaseSessionPoolerUrl({ DATABASE_POOLER_URL: SUPABASE_POOLER_URL }),
    );

    expect(sessionUrl.port).toBe("5432");
    expect(sessionUrl.searchParams.getAll("sslmode")).toEqual(["require"]);
  });
});
