import { describe, expect, it } from "vitest";
import { getNetworkMethodRank, NETWORK_METHOD_ORDER } from "./method-order";

describe("Network Training Method order", () => {
  it("keeps the five primary methods in their visual order", () => {
    expect(NETWORK_METHOD_ORDER.map(getNetworkMethodRank)).toEqual([0, 1, 2, 3, 4]);
  });

  it("places missing and extension methods after the primary methods", () => {
    expect(getNetworkMethodRank(undefined)).toBe(Number.MAX_SAFE_INTEGER);
    expect(getNetworkMethodRank("road-work")).toBe(Number.MAX_SAFE_INTEGER);
  });
});
