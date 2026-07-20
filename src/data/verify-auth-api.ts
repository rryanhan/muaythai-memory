const baseUrl = process.env.AUTH_VERIFY_BASE_URL ?? "http://127.0.0.1:3005";

const checks: Array<{ path: string; method?: string; body?: BodyInit; headers?: HeadersInit }> = [
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

    if (response.status !== 401 || payload?.error !== "Authentication required.") {
      throw new Error(`${check.method ?? "GET"} ${check.path} returned ${response.status}, expected auth 401.`);
    }
  }

  console.log(`Unauthenticated API verification passed for ${checks.length} protected endpoints.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
