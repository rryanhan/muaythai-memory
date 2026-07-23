export {};

const baseUrl = process.env.AUTH_VERIFY_BASE_URL ?? "http://127.0.0.1:3005";
const creationKey = "00000000-0000-4000-8000-000000000009";

type ApiState = "unauthenticated" | "profile-incomplete" | "guide-incomplete" | "fully-onboarded";

type Check = {
  body?: BodyInit;
  cookie?: string;
  expectedStatus: number;
  headers?: HeadersInit;
  label: string;
  method?: string;
  path: string;
  state: ApiState;
};

async function main() {
  const profileIncompleteCookie = requireEnvironment("AUTH_VERIFY_PROFILE_INCOMPLETE_COOKIE");
  const guideIncompleteCookie = requireEnvironment("AUTH_VERIFY_GUIDE_INCOMPLETE_COOKIE");
  const fullyOnboardedCookie = requireEnvironment("AUTH_VERIFY_ONBOARDED_COOKIE");
  const invalidDrillRequest = JSON.stringify({});
  const firstDrillHeaders = {
    "content-type": "application/json",
    "idempotency-key": creationKey,
  };
  const checks: Check[] = [
    {
      expectedStatus: 401,
      label: "normal API requires authentication",
      path: "/api/drills",
      state: "unauthenticated",
    },
    {
      body: invalidDrillRequest,
      expectedStatus: 401,
      headers: firstDrillHeaders,
      label: "first-drill API requires authentication",
      method: "POST",
      path: "/api/onboarding/first-drill",
      state: "unauthenticated",
    },
    {
      cookie: profileIncompleteCookie,
      expectedStatus: 403,
      label: "normal API rejects profile-incomplete user",
      path: "/api/drills",
      state: "profile-incomplete",
    },
    {
      body: invalidDrillRequest,
      cookie: profileIncompleteCookie,
      expectedStatus: 403,
      headers: firstDrillHeaders,
      label: "first-drill API rejects profile-incomplete user",
      method: "POST",
      path: "/api/onboarding/first-drill",
      state: "profile-incomplete",
    },
    {
      cookie: guideIncompleteCookie,
      expectedStatus: 403,
      label: "normal API rejects guide-incomplete user",
      path: "/api/drills",
      state: "guide-incomplete",
    },
    {
      body: invalidDrillRequest,
      cookie: guideIncompleteCookie,
      expectedStatus: 400,
      headers: firstDrillHeaders,
      label: "first-drill API authorizes guide-incomplete user",
      method: "POST",
      path: "/api/onboarding/first-drill",
      state: "guide-incomplete",
    },
    {
      cookie: fullyOnboardedCookie,
      expectedStatus: 200,
      label: "normal API authorizes fully onboarded user",
      path: "/api/drills?keyword=__onboarding_state_verifier_no_match__",
      state: "fully-onboarded",
    },
    {
      body: invalidDrillRequest,
      cookie: fullyOnboardedCookie,
      expectedStatus: 400,
      headers: firstDrillHeaders,
      label: "first-drill replay authorizes fully onboarded user",
      method: "POST",
      path: "/api/onboarding/first-drill",
      state: "fully-onboarded",
    },
  ];

  for (const check of checks) {
    const response = await fetch(new URL(check.path, baseUrl), {
      body: check.body,
      headers: {
        ...check.headers,
        ...(check.cookie ? { cookie: check.cookie } : {}),
      },
      method: check.method ?? "GET",
      redirect: "manual",
    });
    if (response.status !== check.expectedStatus) {
      const payload = await response.text();
      throw new Error(
        `${check.state}: ${check.label} returned ${response.status}, expected`
        + ` ${check.expectedStatus}. ${payload.slice(0, 300)}`,
      );
    }
  }

  console.log(
    `Onboarding API-state verification passed for ${checks.length} non-mutating authenticated and unauthenticated checks.`,
  );
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for non-mutating onboarding API-state verification.`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
