import { describe, expect, it } from "vitest";
import { DrillShareError } from "./errors";
import { drillShareErrorResponse } from "./http";

describe("drillShareErrorResponse", () => {
  it.each([400, 404, 409] as const)(
    "preserves a DrillShareError %i status",
    async (status) => {
      const response = drillShareErrorResponse(
        new DrillShareError(`sharing ${status}`, status),
        "Sharing failed.",
      );

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({ error: `sharing ${status}` });
    },
  );
});
