import { afterEach, describe, expect, it, vi } from "vitest";
import { getAdminClient } from "./client";
import { createClient } from "@supabase/supabase-js";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({})) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("privileged Supabase configuration", () => {
  it("never substitutes the reader key when the service-role key is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "reader-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(getAdminClient()).toBeNull();
  });

  it("uses a service-role client without browser session persistence", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-service-key");
    expect(getAdminClient()).not.toBeNull();
    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "fixture-service-key",
      {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }
    );
  });
});
