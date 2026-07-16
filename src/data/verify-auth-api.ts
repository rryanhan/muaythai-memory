const baseUrl = process.env.AUTH_VERIFY_BASE_URL ?? "http://127.0.0.1:3005";

const checks: Array<{ path: string; method?: string; body?: BodyInit; headers?: HeadersInit }> = [
  { path: "/api/taxonomy" },
  { path: "/api/drills" },
  { path: "/api/drills/00000000-0000-4000-8000-000000000000" },
  { path: "/api/graph" },
  {
    path: "/api/capture/draft",
    method: "POST",
    body: JSON.stringify({ transcript: "Test capture transcript." }),
    headers: { "content-type": "application/json" },
  },
  { path: "/api/capture/transcribe", method: "POST", body: new FormData() },
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
