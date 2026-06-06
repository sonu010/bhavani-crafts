/**
 * Auth setup project — logs in through the REAL UI once and saves the
 * browser storageState every authed `admin` test reuses.
 *
 * This doubles as the login E2E: it exercises /login (password) →
 * /auth/verify-2fa (TOTP) → /admin. If login is broken, every authed
 * test fails fast here.
 *
 * Reads the TOTP secret the seed wrote (e2e/.auth/totp-secret.txt) and
 * generates a fresh code with otplib.
 */
import { test as setup, expect } from "@playwright/test";
import { generate as generateTotp } from "otplib";
import { readFileSync } from "node:fs";
import { TEST_ADMIN, TOTP_SECRET_FILE, AUTH_STATE_FILE } from "./constants";

setup("authenticate as admin", async ({ page }) => {
  const secret = readFileSync(TOTP_SECRET_FILE, "utf8").trim();

  // 1. Password step.
  await page.goto("/login?next=/admin");
  await page.getByLabel(/email/i).fill(TEST_ADMIN.email);
  await page.getByLabel(/password/i).fill(TEST_ADMIN.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  // 2. TOTP step — the AAL1 session must verify to reach AAL2.
  //
  // The login Server Action redirect()s to /admin, then the proxy steps the
  // AAL1 session up to /auth/verify-2fa. Both hops are SOFT (client-side)
  // navigations that don't fire a `load` event, so we assert on the verify
  // form being visible rather than page.waitForURL(..., {load}) — which
  // would hang waiting for a load event that never comes.
  const codeInput = page.getByLabel(/code|otp|verification/i);
  await expect(codeInput).toBeVisible({ timeout: 30_000 });
  const code = await generateTotp({ secret });
  await codeInput.fill(code);
  await page.getByRole("button", { name: /verify|continue|submit/i }).click();

  // 3. Land on the admin dashboard. toHaveURL polls the URL (works with
  //    soft navigations). Reaching /admin (not bounced back to verify-2fa)
  //    is itself the proof the session stepped up to AAL2.
  await expect(page).toHaveURL(/\/admin(\/|$)/, { timeout: 30_000 });

  await page.context().storageState({ path: AUTH_STATE_FILE });
});
