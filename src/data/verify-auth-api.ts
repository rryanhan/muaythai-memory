const baseUrl = process.env.AUTH_VERIFY_BASE_URL ?? "http://127.0.0.1:3005";
const baseOrigin = new URL(baseUrl).origin;

const checks: Array<{
  path: string;
  method?: string;
  body?: BodyInit;
  headers?: HeadersInit;
  expectedStatus?: number;
  expectedError?: string;
}> = [
  {
    path: "/api/auth/recovery/reset",
    method: "POST",
    body: JSON.stringify({ password: "verify-password" }),
    headers: {
      "content-type": "application/json",
      origin: baseOrigin,
    },
    expectedStatus: 403,
    expectedError:
      "This recovery page is no longer active. Request a new recovery link.",
  },
  { path: "/api/taxonomy" },
  { path: "/api/drills" },
  { path: "/api/drills/00000000-0000-4000-8000-000000000000" },
  {
    path: "/api/drills/00000000-0000-4000-8000-000000000000/saved-lists",
    method: "PATCH",
    body: JSON.stringify({ slug: "starred", selected: true }),
    headers: { "content-type": "application/json" },
  },
  { path: "/api/graph" },
  {
    path: "/api/capture/draft",
    method: "POST",
    body: JSON.stringify({ transcript: "Test capture transcript." }),
    headers: { "content-type": "application/json" },
  },
  { path: "/api/capture/transcribe", method: "POST", body: new FormData() },
  { path: "/api/profile", method: "PATCH", body: new FormData() },
  {
    path: "/api/onboarding/profile",
    method: "POST",
    body: JSON.stringify({ username: "verify_user", firstName: "", lastName: "", location: "" }),
    headers: { "content-type": "application/json" },
  },
  { path: "/api/onboarding/skip", method: "POST" },
  {
    path: "/api/onboarding/first-drill",
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
  },
  { path: "/api/journal" },
  {
    path: "/api/journal/uploads",
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
  },
  { path: "/api/journal/00000000-0000-4000-8000-000000000000" },
  {
    path: "/api/journal/00000000-0000-4000-8000-000000000000",
    method: "PATCH",
    body: JSON.stringify({ occurredOn: "2026-07-16", caption: null, drillId: null }),
    headers: { "content-type": "application/json" },
  },
  { path: "/api/journal/00000000-0000-4000-8000-000000000000/complete", method: "POST" },
  { path: "/api/drills/00000000-0000-4000-8000-000000000000/journal-preview" },
];

async function main() {
  for (const check of checks) {
    const response = await fetch(new URL(check.path, baseUrl), {
      method: check.method ?? "GET",
      body: check.body,
      headers: check.headers,
      redirect: "manual",
    });
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const expectedStatus = check.expectedStatus ?? 401;
    const expectedError = check.expectedError ?? "Authentication required.";

    if (response.status !== expectedStatus || payload?.error !== expectedError) {
      throw new Error(
        `${check.method ?? "GET"} ${check.path} returned ${response.status},`
        + ` expected ${expectedStatus}.`,
      );
    }
  }

  console.log(`Unauthenticated API verification passed for ${checks.length} protected endpoints.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
