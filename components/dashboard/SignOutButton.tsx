"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-md border border-[#DADEE5] px-3 py-1.5 text-sm text-[#5B6478] transition-colors hover:border-[#C2542C] hover:text-[#C2542C]"
    >
      Se déconnecter
    </button>
  );
}
