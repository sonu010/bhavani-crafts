"use client";

import { useState } from "react";
import { toast } from "sonner";

/**
 * Newsletter capture (T09). MVP no-op: there is no `newsletter_signups`
 * table and no email provider yet, so this validates the address
 * client-side and shows a thank-you toast. Wiring real capture +
 * double-opt-in is a later task — do NOT add a provider here.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter a valid email.");
      return;
    }
    setError(null);
    setEmail("");
    toast.success("Thanks — we'll be in touch.");
  }

  return (
    <form onSubmit={onSubmit} className="mt-3" noValidate>
      <div className="flex gap-2">
        <input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          aria-label="Email for newsletter"
          className="h-9 w-full min-w-0 rounded-lg border border-husk-200 bg-paper-0 px-3 text-base text-bark-900 outline-none placeholder:text-stone-400 focus-visible:border-teal-800 md:text-sm"
        />
        <button
          type="submit"
          className="h-9 shrink-0 rounded-lg bg-teal-800 px-4 text-sm font-medium text-paper-0 transition-colors hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
        >
          Join
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-brick-600">
          {error}
        </p>
      ) : null}
    </form>
  );
}
