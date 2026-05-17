"use client";

import { useTransition } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "./actions";

/** First letter of local-part, uppercased. Stable across renders. */
function initialOf(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (local[0] ?? "?").toUpperCase();
}

export function UserMenu({
  email,
  role,
}: {
  email: string;
  role: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await signOutAction();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${email}`}
        render={
          <Button variant="ghost" size="sm" className="gap-2 px-2">
            {/* Mobile (<sm): initials avatar only — email/role live in the dropdown */}
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-full bg-teal-800/10 font-mono text-xs text-teal-800 sm:hidden"
            >
              {initialOf(email)}
            </span>
            {/* sm+: email visible alongside chevron */}
            <span className="hidden max-w-[16ch] truncate text-sm sm:inline md:max-w-none">
              {email}
            </span>
            <ChevronDown className="hidden size-4 sm:block" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="text-xs uppercase tracking-wide text-stone-500">
            Signed in as
          </div>
          <div className="mt-1 break-all font-mono text-xs text-bark-900">
            {email}
          </div>
          <div className="mt-1 text-xs text-teal-800">{role}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            handleSignOut();
          }}
          disabled={isPending}
        >
          <LogOut className="mr-2 size-4" />
          {isPending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
