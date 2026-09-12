import { describe, expect, it } from "vitest";
import { hasPostgresErrorCode } from "./postgres-errors";

describe("hasPostgresErrorCode", () => {
  it("matches direct and wrapped PostgreSQL error codes", () => {
    expect(hasPostgresErrorCode({ code: "23505" }, "23505")).toBe(true);
    expect(hasPostgresErrorCode(
      new Error("Query failed", { cause: { code: "23505" } }),
      "23505",
    )).toBe(true);
  });

  it("rejects unrelated and malformed values", () => {
    expect(hasPostgresErrorCode({ code: "23503" }, "23505")).toBe(false);
    expect(hasPostgresErrorCode({ code: 23505 }, "23505")).toBe(false);
    expect(hasPostgresErrorCode("23505", "23505")).toBe(false);
    expect(hasPostgresErrorCode(null, "23505")).toBe(false);
  });

  it("stops safely when an error cause chain contains a cycle", () => {
    const first: { cause?: unknown } = {};
    const second: { cause?: unknown } = { cause: first };
    first.cause = second;

    expect(hasPostgresErrorCode(first, "23505")).toBe(false);
  });
});
