import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reset password — Bhavani Crafts",
  robots: { index: false, follow: false },
};

/**
 * Placeholder page so the "Forgotten password?" link on /login isn't a
 * broken target. The real reset flow (resetPasswordForEmail → email link
 * → /auth/reset-password) lands as a follow-up task.
 *
 * For MVP (single owner) the workaround is to reset via the Supabase
 * dashboard. See user/09-promote-owner-account.md.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <h1 className="font-display text-4xl text-bark-900">Reset password</h1>
      <p className="text-stone-500">
        The in-browser reset flow isn&rsquo;t wired up yet. For now, reset your
        password from the Supabase dashboard:
      </p>
      <ol className="ml-5 list-decimal space-y-2 text-sm text-stone-500">
        <li>Open <span className="font-mono">app.supabase.com</span> → your project.</li>
        <li>Authentication → Users → find your account → &ldquo;Send password recovery&rdquo;.</li>
        <li>Click the email link, set a new password, then come back here.</li>
      </ol>
      <p>
        <Link
          href="/login"
          className="text-teal-800 underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
