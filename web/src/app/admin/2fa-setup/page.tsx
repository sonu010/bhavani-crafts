import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/db/server";
import { EnrollForm } from "./enroll-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Set up two-factor authentication",
  robots: { index: false, follow: false },
};

/**
 * TOTP enrollment.
 *
 * The proxy lands AAL1 sessions with no verified factor here. The page:
 *   1. Sends already-AAL2 sessions to /admin (the proxy normally handles
 *      this, but a direct nav by an AAL2 user gets bounced).
 *   2. Unenrolls any unverified factors left over from a previous attempt
 *      (Supabase doesn't let us re-fetch the QR for an existing factor —
 *      QR is only emitted at enroll time — so leftover unverified factors
 *      become orphans we need to clean up).
 *   3. Calls mfa.enroll({ factorType: 'totp' }) to mint a fresh factor +
 *      QR and passes the data to the client form.
 *
 * The whole flow is per-page-load: any reload starts over with a fresh
 * QR. Server-rendered.
 */
export default async function TwoFactorSetupPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // The proxy should have caught this; belt + suspenders.
    redirect("/login");
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") {
    redirect("/admin");
  }

  const { data: factorsList } = await supabase.auth.mfa.listFactors();
  // Supabase API: `factorsList.totp` only contains *verified* TOTP
  // factors. Unverified ones live in `factorsList.all` with
  // factor_type='totp' + status='unverified'. So:
  //   - "has verified TOTP?" → check `.totp.length > 0`
  //   - "cleanup unverified TOTP?" → iterate `.all`, filter manually
  // The Supabase types call `.totp` a TOTP array; the implicit "verified"
  // semantic is undocumented but consistent in our smoke (see
  // scripts/debug-enroll.mjs).
  if ((factorsList?.totp?.length ?? 0) > 0) {
    redirect("/auth/verify-2fa");
  }

  for (const f of factorsList?.all ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({
    factorType: "totp",
  });
  if (enrollErr || !enrollData) {
    throw new Error(`mfa.enroll failed: ${enrollErr?.message ?? "unknown"}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="font-display text-4xl text-bark-900">Set up 2FA</h1>
        <p className="text-sm text-stone-500">
          Owner accounts require two-factor authentication. Scan this QR code
          with an authenticator app (1Password, Authy, Google Authenticator)
          and enter the 6-digit code to confirm.
        </p>
      </header>

      <EnrollForm
        factorId={enrollData.id}
        qrCodeDataUri={enrollData.totp.qr_code}
        secret={enrollData.totp.secret}
      />
    </main>
  );
}
