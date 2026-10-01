import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  // App code uses the Next "@/*" alias; resolve it here too so tests can
  // import pages/components the same way the app does.
  resolve: {
    alias: { "@": resolve(process.cwd(), "src") },
  },
  esbuild: { jsx: "automatic" },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}", "crawler/**/*.test.{ts,tsx}"],
    environment: "node",
    // Embedded PGlite boots real Postgres (WASM); allow headroom on slow/loaded machines.
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
