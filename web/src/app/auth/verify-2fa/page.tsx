import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/db/server";
import { VerifyForm } from "./verify-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Two-factor verification",
  robots: { index: false, follow: false },
};

/**
 * AAL1 → AAL2 step on subsequent sign-ins, after the user already
 * enrolled a TOTP factor.
 *
 * The proxy lands AAL1 sessions here when a verified factor exists. If
 * the user hits this page directly:
 *   - already AAL2 → /admin
 *   - signed out → /login
 *   - has no verified factor → /admin/2fa-setup
 */
export default async function VerifyTwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Where to land after the code verifies. Only honor a same-site absolute
  // path; anything else is a redirect open-target and falls back to /admin.
  const { next: nextRaw } = await searchParams;
  const next =
    typeof nextRaw === "string" && nextRaw.startsWith("/") && !nextRaw.startsWith("//")
      ? nextRaw
      : "/admin";

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") {
    redirect(next);
  }

  const { data: factorsList } = await supabase.auth.mfa.listFactors();
  const verified = factorsList?.totp?.find((f) => f.status === "verified");
  if (!verified) {
    redirect("/admin/2fa-setup");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="font-display text-4xl text-bark-900">
          Enter your 2FA code
        </h1>
        <p className="text-sm text-stone-500">
          We need a fresh 6-digit code from your authenticator app to finish
          signing you in.
        </p>
      </header>

      <VerifyForm factorId={verified.id} next={next} />
    </main>
  );
}
