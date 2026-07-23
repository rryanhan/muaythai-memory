import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  getPublicRequestOrigin,
  isSameOriginRequest,
} from "./request-origin";

describe("auth request origin", () => {
  it("accepts the public forwarded origin used behind the deployment proxy", () => {
    const request = new NextRequest("http://internal:3000/api/auth/recovery/reset", {
      headers: {
        host: "internal:3000",
        origin: "https://staging.example.com",
        "x-forwarded-host": "staging.example.com",
        "x-forwarded-proto": "https",
      },
      method: "POST",
    });

    expect(getPublicRequestOrigin(request)).toBe("https://staging.example.com");
    expect(isSameOriginRequest(request)).toBe(true);
  });

  it("rejects cross-origin, missing-origin, and malformed-origin mutations", () => {
    const requests = [
      new NextRequest("https://staging.example.com/api/auth/recovery/reset", {
        headers: { origin: "https://attacker.example" },
        method: "POST",
      }),
      new NextRequest("https://staging.example.com/api/auth/recovery/reset", {
        method: "POST",
      }),
      new NextRequest("https://staging.example.com/api/auth/recovery/reset", {
        headers: { origin: "not a URL" },
        method: "POST",
      }),
    ];

    for (const request of requests) {
      expect(isSameOriginRequest(request)).toBe(false);
    }
  });
});
