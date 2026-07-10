"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LogOut, Users } from "lucide-react";
import { signOutAction } from "@/app/(dashboard)/actions";
import type { Role } from "@/types/auth";

// Pixel values transcribed from the Member Directory mockup (design/README.md
// §Shared: Sidebar). Uses real Lucide icons in place of the mockup's
// placeholder CSS-shape icons (its own README notes those aren't meant to
// be recreated literally — "not SVGs or an icon font").

const NAV_ITEMS = [
  { href: "/people", label: "People", icon: Users },
  { href: "/households", label: "Families & Households", icon: Home },
];

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  staff: "Staff (View Only)",
};

function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function Sidebar({ user }: { user: { name: string; role: Role } }) {
  const pathname = usePathname();
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Church Directory";

  return (
    <aside className="flex w-[248px] shrink-0 flex-col bg-brand-navy px-5 py-7">
      <div className="mb-9 flex items-center gap-2.5 px-1">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white">
          <Image src="/stsa-logo.png" alt="STSA Church" fill sizes="36px" className="object-cover" />
        </div>
        <div>
          <div className="font-heading text-base font-semibold leading-tight text-brand-cream">
            {appName}
          </div>
          <div className="text-[11px] uppercase tracking-[0.04em] text-[#B9C4CF]">
            Staff Directory
          </div>
        </div>
      </div>

      <div className="mb-2.5 ml-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7C8FA0]">
        Directory
      </div>
      <nav>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`mb-0.5 flex items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-[14.5px] transition-colors ${
                active
                  ? "bg-brand-sky/[0.18] font-bold text-brand-cream"
                  : "font-medium text-[#B7C3CF] hover:bg-white/5"
              }`}
            >
              <Icon className={`h-[18px] w-[18px] ${active ? "text-brand-sky" : "text-[#7C8FA0]"}`} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-white/[0.12] pt-5">
        <div className="flex items-center gap-2.5 px-3 py-[9px]">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2E4E6E] text-[11px] font-bold text-[#8FD9FA]">
            {initialsOf(user.name)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-brand-cream">{user.name}</div>
            <div className="text-[11.5px] text-[#8FA1B2]">{ROLE_LABEL[user.role]}</div>
          </div>
          <form action={signOutAction} className="ml-auto">
            <button
              type="submit"
              aria-label="Sign out"
              className="rounded p-1 text-[#8FA1B2] transition-colors hover:text-brand-cream"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
