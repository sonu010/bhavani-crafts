import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/db/server";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

/**
 * Sign-in page.
 *
 * - Already-AAL2 sessions are bounced to ?next= (default /admin).
 * - AAL1 sessions are left on /login so they can re-authenticate with a
 *   different account; the form action handles them either way.
 *
 * See claude/SESSION-RESUME.md §"Admin login" for the 10-layer defense
 * spec. This page covers layers 1, 2, 6 (cookie attributes via
 * @supabase/ssr), 8 (noindex via layout.tsx), and 9 (no storefront links
 * to this route — verified by grep in CI later). Layers 3 (rate limit),
 * 4 (captcha), 5 (TOTP), and 10 (audit log) land in the form action and
 * the sibling /admin/2fa-setup + /auth/verify-2fa routes.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") {
      redirect(params.next && params.next.startsWith("/") ? params.next : "/admin");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="font-display text-4xl text-bark-900">Sign in</h1>
        <p className="text-sm text-stone-500">
          Bhavani Crafts admin. Access is owner-only.
        </p>
      </header>

      <LoginForm
        next={params.next ?? null}
        initialError={params.error ?? null}
      />

      <p className="text-sm text-stone-500">
        Forgotten password?{" "}
        <Link
          href="/auth/forgot-password"
          className="text-teal-800 underline-offset-4 hover:underline"
        >
          Reset it
        </Link>
        .
      </p>
    </main>
  );
}
