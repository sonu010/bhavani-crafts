/**
 * Shared E2E constants. The test admin is a fixed account on the LOCAL
 * Supabase stack only — its credentials are non-secret by design (local
 * dev never holds real data).
 */
import path from "node:path";

export const TEST_ADMIN = {
  email: "e2e-admin@bhavani.test",
  password: "e2e-admin-password-123",
} as const;

/** Where the seed writes the enrolled TOTP secret for the auth setup
 *  to read. Gitignored. */
export const TOTP_SECRET_FILE = path.join(
  process.cwd(),
  "e2e",
  ".auth",
  "totp-secret.txt",
);

/** Saved browser storageState (cookies) the authed `admin` project
 *  reuses so we log in once, not per test. */
export const AUTH_STATE_FILE = path.join(
  process.cwd(),
  "e2e",
  ".auth",
  "admin.json",
);
