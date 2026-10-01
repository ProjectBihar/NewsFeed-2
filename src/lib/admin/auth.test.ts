import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isAuthorized } from "./auth";

const ENV = {
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD_SHA256: createHash("sha256").update("s3cret", "utf8").digest("hex"),
};

const header = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

describe("isAuthorized (Phase 21)", () => {
  it("rejects missing, malformed, and wrong credentials", async () => {
    expect(await isAuthorized(null, ENV)).toBe(false);
    expect(await isAuthorized("Bearer x", ENV)).toBe(false);
    expect(await isAuthorized(header("admin", "wrong"), ENV)).toBe(false);
    expect(await isAuthorized(header("other", "s3cret"), ENV)).toBe(false);
  });

  it("rejects unconfigured env rather than opening up", async () => {
    expect(await isAuthorized(header("admin", "s3cret"), {})).toBe(false);
    expect(await isAuthorized(header("admin", "s3cret"), { ADMIN_USERNAME: "admin" })).toBe(false);
  });

  it("accepts exact credentials", async () => {
    expect(await isAuthorized(header("admin", "s3cret"), ENV)).toBe(true);
  });
});
