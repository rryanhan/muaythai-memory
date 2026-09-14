import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { createSupabaseAdminClient } from "./admin";

beforeEach(() => {
  mocks.createClient.mockReset().mockReturnValue({ kind: "admin-client" });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

it("installs an explicitly scoped fetch implementation", () => {
  const fetchImplementation = vi.fn() as unknown as typeof globalThis.fetch;

  createSupabaseAdminClient({ fetch: fetchImplementation });

  expect(mocks.createClient).toHaveBeenCalledWith(
    "https://project.supabase.co",
    "service-role-key",
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: { fetch: fetchImplementation },
    },
  );
});

it("leaves existing admin clients on the SDK fetch default", () => {
  createSupabaseAdminClient();

  expect(mocks.createClient).toHaveBeenCalledWith(
    "https://project.supabase.co",
    "service-role-key",
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
});
