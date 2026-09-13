import { describe, expect, it } from "vitest";
import { ConnectionMutationError } from "./errors";
import { connectionErrorResponse } from "./http";

describe("connectionErrorResponse", () => {
  it.each([400, 404, 409, 429] as const)(
    "preserves a ConnectionMutationError %i status",
    async (status) => {
      const response = connectionErrorResponse(
        new ConnectionMutationError(`connection ${status}`, status),
        "Connection failed.",
      );

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({ error: `connection ${status}` });
    },
  );
});
