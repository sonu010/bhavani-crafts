"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAuthAttempt } from "@/lib/auth/audit";
import { createAdminClient } from "@/lib/db/admin";
import { createServerClient } from "@/lib/db/server";

const GENERIC_ERROR = "That code didn't match. Try the next one your authenticator shows.";

export async function verify2faAction(
  formData: FormData,
): Promise<{ error: string } | void> {
  const factorIdRaw = formData.get("factorId");
  const codeRaw = formData.get("code");
  if (typeof factorIdRaw !== "string" || typeof codeRaw !== "string") {
    return { error: GENERIC_ERROR };
  }
  const factorId = factorIdRaw;
  const code = codeRaw.trim();
  if (!/^\d{6}$/.test(code)) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createServerClient();
  const admin = createAdminClient();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
    factorId,
  });
  if (chErr || !challenge) {
    await recordAuthAttempt(admin, {
      actorId: user.id,
      action: "auth.mfa_verify_failed",
      entityId: user.id,
      afterJson: { ip, factor_id: factorId, stage: "challenge", reason: chErr?.code ?? "unknown" },
      requestId,
    });
    return { error: GENERIC_ERROR };
  }

  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (verifyErr) {
    await recordAuthAttempt(admin, {
      actorId: user.id,
      action: "auth.mfa_verify_failed",
      entityId: user.id,
      afterJson: { ip, factor_id: factorId, stage: "verify", reason: verifyErr.code ?? "unknown" },
      requestId,
    });
    return { error: GENERIC_ERROR };
  }

  await recordAuthAttempt(admin, {
    actorId: user.id,
    action: "auth.mfa_verify",
    entityId: user.id,
    afterJson: { ip, factor_id: factorId, mfa_level: "aal2" },
    requestId,
  });

  redirect("/admin");
}
