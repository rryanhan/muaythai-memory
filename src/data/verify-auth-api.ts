const baseUrl = process.env.AUTH_VERIFY_BASE_URL ?? "http://localhost:3005";
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
  { path: "/api/connections" },
  { path: "/api/connections?section=followers" },
  { path: "/api/connections/search?username=verify_user" },
  {
    path: "/api/follows",
    method: "POST",
    body: JSON.stringify({ username: "verify_user" }),
    headers: { "content-type": "application/json" },
  },
  {
    path: "/api/follows/00000000-0000-4000-8000-000000000000",
    method: "DELETE",
  },
  {
    path: "/api/follow-requests/00000000-0000-4000-8000-000000000000",
    method: "PATCH",
    body: JSON.stringify({ action: "accept" }),
    headers: { "content-type": "application/json" },
  },
  {
    path: "/api/connections/blocks",
    method: "POST",
    body: JSON.stringify({ userId: "00000000-0000-4000-8000-000000000000" }),
    headers: { "content-type": "application/json" },
  },
  {
    path: "/api/connections/blocks/00000000-0000-4000-8000-000000000000",
    method: "DELETE",
  },
  {
    path: "/api/connections/reports",
    method: "POST",
    body: JSON.stringify({
      userId: "00000000-0000-4000-8000-000000000000",
      reason: "spam",
    }),
    headers: { "content-type": "application/json" },
  },
  { path: "/api/fighters/verify_user/connections?section=followers" },
  { path: "/api/fighters/verify_user" },
  {
    path: "/api/drills/00000000-0000-4000-8000-000000000000/shares",
  },
  {
    path: "/api/drills/00000000-0000-4000-8000-000000000000/shares",
    method: "PATCH",
    body: JSON.stringify({
      recipientUserId: "00000000-0000-4000-8000-000000000001",
      shared: true,
    }),
    headers: { "content-type": "application/json" },
  },
  { path: "/api/shared-drills" },
  { path: "/api/shared-drills/00000000-0000-4000-8000-000000000000" },
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
