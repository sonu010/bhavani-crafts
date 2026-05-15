import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * The service-role Supabase client lives at @/lib/db/admin. It bypasses RLS,
 * so it must only be imported from:
 *   - app/admin/**          (admin routes — protected by middleware)
 *   - app/api/admin/**      (admin API routes)
 *   - scripts/**            (one-off seeders/migrations run from CLI)
 *
 * The rule below blocks the import everywhere else. If you trip it, fix the
 * import site — do NOT disable the rule.
 *
 * See claude/architecture/security.md §"Service-role key isolation".
 */
const restrictAdminClient = {
  files: ["src/**/*.{ts,tsx}"],
  ignores: [
    "src/app/admin/**",
    "src/app/api/admin/**",
    "src/lib/db/admin.ts",
  ],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@/lib/db/admin",
            message:
              "Service-role client bypasses RLS. Import only from app/admin/**, app/api/admin/**, or scripts/**.",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  restrictAdminClient,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
