import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Mirror the @/* alias from tsconfig.json so test imports work the
      // same as application imports. Without this, vitest falls back to
      // bare-package resolution and the @/ paths fail.
      "@": path.resolve(__dirname, "./src"),
      // `server-only` is a Next runtime guard that throws on import to
      // block accidental inclusion in client bundles. Tests don't have a
      // client bundle, so we substitute an empty module so server-side
      // helpers can be exercised directly.
      "server-only": path.resolve(__dirname, "./__tests__/_helpers/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 15_000,
    fileParallelism: false,
  },
});
