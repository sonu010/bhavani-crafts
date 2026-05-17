"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAuthAttempt } from "@/lib/auth/audit";
import { createAdminClient } from "@/lib/db/admin";
import { createServerClient } from "@/lib/db/server";

export async function signOutAction(): Promise<void> {
  const supabase = await createServerClient();
  const admin = createAdminClient();
  const h = await headers();
  const requestId =
    h.get("x-vercel-id") ?? h.get("x-request-id") ?? crypto.randomUUID();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Global scope invalidates the refresh token on every device. Per
  // architecture/auth-and-roles.md §"Session policy".
  await supabase.auth.signOut({ scope: "global" });

  if (user) {
    await recordAuthAttempt(admin, {
      actorId: user.id,
      action: "auth.signout",
      entityId: user.id,
      afterJson: { ip },
      requestId,
    });
  }

  redirect("/login");
}
