import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireAdmin } from "./require-auth";

const request = vi.hoisted(() => ({ authorization: null as string | null }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(request.authorization ? { authorization: request.authorization } : {}),
}));
afterEach(() => {
  request.authorization = null;
  vi.unstubAllEnvs();
});

describe("request-level admin authorization", () => {
  it("fails closed for absent or wrong credentials", async () => {
    vi.stubEnv("ADMIN_USERNAME", "editor");
    vi.stubEnv(
      "ADMIN_PASSWORD_SHA256",
      createHash("sha256").update("fixture-password").digest("hex")
    );
    await expect(requireAdmin()).rejects.toThrow("Admin access required.");
    request.authorization = `Basic ${Buffer.from("editor:wrong").toString("base64")}`;
    await expect(requireAdmin()).rejects.toThrow("Admin access required.");
    request.authorization = `Basic ${Buffer.from("editor:fixture-password").toString("base64")}`;
    await expect(requireAdmin()).resolves.toBeUndefined();
  });
});
