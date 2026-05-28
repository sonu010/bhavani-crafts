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
  await page.waitForURL(/\/auth\/verify-2fa/);
  const code = await generateTotp({ secret });
  await page.getByLabel(/code|otp|verification/i).fill(code);
  await page.getByRole("button", { name: /verify|continue|submit/i }).click();

  // 3. Land on the admin dashboard.
  await page.waitForURL(/\/admin(\/|$)/);
  await expect(page).toHaveURL(/\/admin(\/|$)/);

  await page.context().storageState({ path: AUTH_STATE_FILE });
});
