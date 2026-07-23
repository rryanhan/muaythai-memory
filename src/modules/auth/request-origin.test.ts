import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  getCanonicalAppOrigin,
  isSameOriginRequest,
} from "./request-origin";

describe("auth request origin", () => {
  it("uses the configured canonical origin behind the deployment proxy", () => {
    const request = new NextRequest("http://internal:3000/api/auth/recovery/reset", {
      headers: {
        host: "internal:3000",
        origin: "https://staging.example.com",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "http",
      },
      method: "POST",
    });
    const environment = {
      NEXT_PUBLIC_APP_URL: "https://staging.example.com/app-path",
      NODE_ENV: "production",
    };

    expect(getCanonicalAppOrigin(request, environment)).toBe(
      "https://staging.example.com",
    );
    expect(isSameOriginRequest(request, environment)).toBe(true);
  });

  it("rejects spoofed forwarded headers even when Origin matches them", () => {
    const request = new NextRequest("http://internal:3000/api/auth/recovery/reset", {
      headers: {
        host: "internal:3000",
        origin: "https://attacker.example",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
      },
      method: "POST",
    });

    expect(isSameOriginRequest(request, {
      NEXT_PUBLIC_APP_URL: "https://staging.example.com",
      NODE_ENV: "production",
    })).toBe(false);
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
      expect(isSameOriginRequest(request, {
        NEXT_PUBLIC_APP_URL: "https://staging.example.com",
        NODE_ENV: "production",
      })).toBe(false);
    }
  });

  it("falls back only to a loopback request URL in local development", () => {
    const localRequest = new NextRequest(
      "http://localhost:3005/api/auth/recovery/reset",
      {
        headers: {
          origin: "http://localhost:3005",
          "x-forwarded-host": "attacker.example",
          "x-forwarded-proto": "https",
        },
        method: "POST",
      },
    );

    expect(getCanonicalAppOrigin(localRequest, {
      NODE_ENV: "development",
    })).toBe("http://localhost:3005");
    expect(isSameOriginRequest(localRequest, {
      NODE_ENV: "development",
    })).toBe(true);

    expect(() => getCanonicalAppOrigin(localRequest, {
      NODE_ENV: "production",
    })).toThrow("NEXT_PUBLIC_APP_URL is required");
    expect(() => getCanonicalAppOrigin(
      new NextRequest("https://preview.example.com/auth/confirm"),
      { NODE_ENV: "development" },
    )).toThrow("NEXT_PUBLIC_APP_URL is required");
    expect(() => getCanonicalAppOrigin(localRequest, {
      NEXT_PUBLIC_APP_URL: "http://staging.example.com",
      NODE_ENV: "production",
    })).toThrow("must use HTTPS");
  });
});
