// Prints sha256(password) for ADMIN_PASSWORD_SHA256.
// Usage: ADMIN_PASSWORD='...' node scripts/admin-password-hash.mjs
// (reads env so the secret never lands in shell history or files).
import { createHash } from "node:crypto";

const password = process.env.ADMIN_PASSWORD;
if (!password) {
  console.error("Set ADMIN_PASSWORD in the environment first.");
  process.exit(1);
}
console.log(createHash("sha256").update(password, "utf8").digest("hex"));
