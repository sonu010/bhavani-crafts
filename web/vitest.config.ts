import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Mirror the @/* alias from tsconfig.json so test imports work the
      // same as application imports. Without this, vitest falls back to
      // bare-package resolution and the @/ paths fail.
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 15_000,
    fileParallelism: false,
  },
});
