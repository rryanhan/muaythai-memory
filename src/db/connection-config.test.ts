import { describe, expect, it } from "vitest";
import {
  getMigrationDatabaseUrl,
  getRuntimeDatabaseConfig,
  getSupabaseSessionPoolerUrl,
} from "./connection-config";

const SUPABASE_POOLER_URL =
  "postgresql://postgres.project-ref:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres";
const SUPABASE_SESSION_POOLER_URL = SUPABASE_POOLER_URL.replace(
  ":6543/",
  ":5432/",
);
const SUPABASE_DIRECT_URL =
  "postgresql://postgres:password@db.projectref.supabase.co:5432/postgres";

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

  it("defaults canonical Supabase direct connections to required TLS", () => {
    const connectionString = `${SUPABASE_DIRECT_URL}?application_name=muaythai-memory`;

    const config = getRuntimeDatabaseConfig({
      DATABASE_POOLER_URL: connectionString,
    });

    const normalized = new URL(config.connectionString);
    expect(normalized.searchParams.get("application_name")).toBe(
      "muaythai-memory",
    );
    expect(normalized.searchParams.getAll("sslmode")).toEqual(["require"]);
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

  it.each(["require", "verify-ca", "verify-full"])(
    "allows the secure Supabase direct sslmode %s",
    (sslmode) => {
      const connectionString = `${SUPABASE_DIRECT_URL}?sslmode=${sslmode}`;

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

  it.each(["disable", "allow", "prefer", "false"])(
    "rejects the plaintext-capable Supabase direct sslmode %s",
    (sslmode) => {
      expect(() =>
        getRuntimeDatabaseConfig({
          DATABASE_POOLER_URL: `${SUPABASE_DIRECT_URL}?sslmode=${sslmode}`,
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

  it("requires Supabase direct runtime connections to use port 5432", () => {
    expect(() =>
      getRuntimeDatabaseConfig({
        DATABASE_POOLER_URL: SUPABASE_DIRECT_URL.replace(":5432/", ":6543/"),
      }),
    ).toThrow(
      "DATABASE_POOLER_URL must use Supabase direct database hosts on port 5432.",
    );
  });

  it.each([
    "postgresql://postgres:password@localhost:5432/muaythai?sslmode=disable",
    "postgresql://postgres:password@db.example.com:5432/muaythai",
    "postgresql://postgres:password@pooler.supabase.com.evil.example:5432/muaythai?sslmode=prefer",
    "postgresql://postgres:password@db.projectref.supabase.co.evil.example:5432/muaythai?sslmode=prefer",
  ])("preserves non-Supabase runtime URLs byte-for-byte: %s", (connectionString) => {
    expect(
      getRuntimeDatabaseConfig({ DATABASE_POOLER_URL: connectionString })
        .connectionString,
    ).toBe(connectionString);
  });
});

describe("getMigrationDatabaseUrl", () => {
  it.each([
    ["direct", SUPABASE_DIRECT_URL],
    ["session-pooler", SUPABASE_SESSION_POOLER_URL],
  ])("defaults canonical Supabase %s connections to required TLS", (_, url) => {
    const connectionString = `${url}?application_name=muaythai-memory`;

    const normalized = new URL(
      getMigrationDatabaseUrl({ DATABASE_DIRECT_URL: connectionString }),
    );

    expect(normalized.searchParams.get("application_name")).toBe(
      "muaythai-memory",
    );
    expect(normalized.searchParams.getAll("sslmode")).toEqual(["require"]);
  });

  it.each(
    [SUPABASE_DIRECT_URL, SUPABASE_SESSION_POOLER_URL].flatMap((url) =>
      ["require", "verify-ca", "verify-full"].map(
        (sslmode) => [`${url}?sslmode=${sslmode}`, sslmode] as const,
      ),
    ),
  )("allows a canonical Supabase migration URL using %s", (connectionString) => {
    expect(
      getMigrationDatabaseUrl({ DATABASE_DIRECT_URL: connectionString }),
    ).toBe(connectionString);
  });

  it.each(
    [SUPABASE_DIRECT_URL, SUPABASE_SESSION_POOLER_URL].flatMap((url) =>
      ["disable", "allow", "prefer", "false"].map(
        (sslmode) => [`${url}?sslmode=${sslmode}`, sslmode] as const,
      ),
    ),
  )(
    "rejects a plaintext-capable canonical Supabase migration URL using %s",
    (connectionString) => {
      expect(() =>
        getMigrationDatabaseUrl({ DATABASE_DIRECT_URL: connectionString }),
      ).toThrow(
        "DATABASE_DIRECT_URL or DATABASE_URL sslmode must be require, verify-ca, or verify-full.",
      );
    },
  );

  it.each([SUPABASE_DIRECT_URL, SUPABASE_SESSION_POOLER_URL])(
    "rejects duplicate sslmode parameters for canonical Supabase migration URL %s",
    (connectionString) => {
      expect(() =>
        getMigrationDatabaseUrl({
          DATABASE_DIRECT_URL: `${connectionString}?sslmode=require&SSLMODE=verify-full`,
        }),
      ).toThrow(
        "DATABASE_DIRECT_URL or DATABASE_URL must include at most one sslmode parameter.",
      );
    },
  );

  it.each([
    SUPABASE_DIRECT_URL.replace(":5432/", ":6543/"),
    SUPABASE_SESSION_POOLER_URL.replace(":5432/", ":6543/"),
  ])("requires canonical Supabase migration URLs to use port 5432: %s", (url) => {
    expect(() =>
      getMigrationDatabaseUrl({ DATABASE_DIRECT_URL: url }),
    ).toThrow(
      "DATABASE_DIRECT_URL or DATABASE_URL must use a direct database host or Supabase session mode on port 5432.",
    );
  });

  it("normalizes a canonical direct URL supplied through legacy DATABASE_URL", () => {
    const normalized = new URL(
      getMigrationDatabaseUrl({ DATABASE_URL: SUPABASE_DIRECT_URL }),
    );

    expect(normalized.searchParams.getAll("sslmode")).toEqual(["require"]);
  });

  it.each([
    "postgresql://postgres:password@localhost:5432/muaythai?sslmode=disable",
    "postgresql://postgres:password@db.example.com:5432/muaythai",
    "postgresql://postgres:password@db.projectref.supabase.co.evil.example:5432/muaythai?sslmode=prefer",
  ])("preserves non-Supabase migration URLs byte-for-byte: %s", (connectionString) => {
    expect(
      getMigrationDatabaseUrl({ DATABASE_DIRECT_URL: connectionString }),
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
