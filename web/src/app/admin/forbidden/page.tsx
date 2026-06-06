import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Forbidden",
  robots: { index: false, follow: false },
};

/**
 * Rendered when a server action throws ForbiddenError or when the
 * authenticated user lacks the role for the route they tried to reach.
 *
 * The proxy allows AAL1 sessions through to this path (see the AAL1
 * allow-list in src/proxy.ts) so a viewer doesn't get a redirect loop
 * trying to read the "you can't do this" message.
 */
export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-16">
      <h1 className="font-display text-4xl text-bark-900">Forbidden</h1>
      <p className="text-stone-500">
        You&rsquo;re signed in, but your account doesn&rsquo;t have permission for
        this area. If you think this is wrong, ask the site owner to update
        your role.
      </p>
      <div className="flex gap-4">
        <Link
          href="/"
          className="text-teal-800 underline-offset-4 hover:underline"
        >
          Go to the storefront
        </Link>
      </div>
    </main>
  );
}
