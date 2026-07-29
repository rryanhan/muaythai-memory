import { describe, expect, it } from "vitest";
import { canonicalFriendPair, otherFriendId } from "./pair";

describe("friend pair helpers", () => {
  it("normalizes either request direction to the same pair", () => {
    expect(canonicalFriendPair("a", "b")).toEqual({
      userOneId: "a",
      userTwoId: "b",
    });
    expect(canonicalFriendPair("b", "a")).toEqual({
      userOneId: "a",
      userTwoId: "b",
    });
  });

  it("rejects self-friendship", () => {
    expect(() => canonicalFriendPair("same", "same")).toThrow(
      "two different users",
    );
  });

  it("returns only the other member of a pair", () => {
    const pair = canonicalFriendPair("a", "b");
    expect(otherFriendId(pair, "a")).toBe("b");
    expect(otherFriendId(pair, "b")).toBe("a");
    expect(otherFriendId(pair, "c")).toBeNull();
  });
});
