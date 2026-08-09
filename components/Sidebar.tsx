"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Baby,
  BarChart3,
  Cake,
  CalendarCheck,
  History,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Tablet,
  Users,
  X,
} from "lucide-react";
import { signOutAction } from "@/app/(dashboard)/actions";
import type { Role } from "@/types/auth";

// Pixel values transcribed from the Member Directory mockup (design/README.md
// §Shared: Sidebar). Uses real Lucide icons in place of the mockup's
// placeholder CSS-shape icons (its own README notes those aren't meant to
// be recreated literally — "not SVGs or an icon font").
//
// Below the `lg` breakpoint this is a top bar + slide-out drawer (same nav
// content as the desktop rail) PLUS a fixed bottom tab bar for one-tap
// access to the handful of surfaces people actually reach for constantly
// (ADR-0019 Phase 3 — the native-app-feel mitigation for Apple's Guideline
// 4.2 "just a website" scrutiny). The drawer stays as the "everything else"
// surface (Households, Birthdays, Reports, Settings, sign out) behind the
// tab bar's "More" tab, rather than duplicating that whole list into two
// places.

// ADR-0011: nav is role-scoped. Volunteers only ever see Children; staff/admin
// get the full directory plus Children.
const NAV_ITEMS: Array<{ href: string; label: string; icon: typeof Users; roles: Role[] }> = [
  { href: "/people", label: "People", icon: Users, roles: ["admin", "staff"] },
  { href: "/households", label: "Households", icon: Home, roles: ["admin", "staff"] },
  { href: "/birthdays", label: "Birthdays", icon: Cake, roles: ["admin", "staff"] },
  { href: "/children", label: "Children and Youth", icon: Baby, roles: ["admin", "staff", "volunteer"] },
  { href: "/events", label: "Events", icon: CalendarCheck, roles: ["admin", "staff", "volunteer"] },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "staff"] },
  { href: "/settings/devices", label: "Kiosk devices", icon: Tablet, roles: ["admin"] },
  { href: "/settings/activity", label: "Activity Log", icon: History, roles: ["admin"] },
];

// The curated subset of NAV_ITEMS (plus a "Home" tab, which isn't in the
// drawer at all — the logo/app name link already covers that there) that
// gets its own always-visible bottom tab, capped at four real destinations
// so the bar never needs to scroll or shrink below a comfortable tap
// target. Everything else in NAV_ITEMS stays reachable via the "More" tab,
// which opens the same drawer the top bar's hamburger button does.
const BOTTOM_TAB_ITEMS: Array<{ href: string; label: string; icon: typeof Users; roles: Role[] }> = [
  { href: "/", label: "Home", icon: LayoutDashboard, roles: ["admin", "staff", "volunteer"] },
  { href: "/people", label: "People", icon: Users, roles: ["admin", "staff"] },
  { href: "/children", label: "Children", icon: Baby, roles: ["admin", "staff", "volunteer"] },
  { href: "/events", label: "Events", icon: CalendarCheck, roles: ["admin", "staff", "volunteer"] },
];

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  staff: "Staff (View Only)",
  volunteer: "Volunteer (View Only)",
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

function SidebarContent({
  user,
  appName,
  pathname,
  onNavigate,
}: {
  user: { name: string; role: Role; canEmailChildren?: boolean };
  appName: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  // ADR-0017: a Team Lead is role "volunteer" under the hood (see
  // types/auth.ts) — canEmailChildren is the only thing distinguishing them,
  // so the label falls back to it rather than adding a new Role value just
  // for display purposes.
  const roleLabel =
    user.role === "volunteer" && user.canEmailChildren ? "Team Lead" : ROLE_LABEL[user.role];
  return (
    <>
      <Link href="/" onClick={onNavigate} className="mb-9 flex items-center gap-2.5 px-1">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white">
          <Image src="/stsa-logo.png" alt="STSA Church" fill sizes="36px" className="object-cover" />
        </div>
        <div>
          <div className="font-heading text-base font-semibold leading-tight text-brand-cream">
            {appName}
          </div>
          <div className="text-[11px] uppercase tracking-[0.04em] text-[#B9C4CF]">
            People Directory
          </div>
        </div>
      </Link>

      <div className="mb-2.5 ml-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7C8FA0]">
        Directory
      </div>
      <nav>
        {NAV_ITEMS.filter((item) => item.roles.includes(user.role)).map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
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
            <div className="text-[11.5px] text-[#8FA1B2]">{roleLabel}</div>
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
    </>
  );
}

export function Sidebar({ user }: { user: { name: string; role: Role; canEmailChildren?: boolean } }) {
  const pathname = usePathname();
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "STSA Church Directory";
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Auto-close the drawer whenever navigation happens (covers taps on a
  // nav link as well as back/forward).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const bottomTabs = BOTTOM_TAB_ITEMS.filter((item) => item.roles.includes(user.role));
  // The "More" tab represents everything in the drawer that ISN'T already a
  // bottom tab — active when the current page only lives there (e.g.
  // /reports), so the bar never leaves every tab looking unselected.
  const moreActive = NAV_ITEMS.filter((item) => item.roles.includes(user.role))
    .filter((item) => !bottomTabs.some((tab) => tab.href === item.href))
    .some((item) => pathname.startsWith(item.href));

  return (
    <>
      {/* Mobile top bar — replaces the desktop rail below `lg`. */}
      <header className="flex items-center justify-between bg-brand-navy px-4 py-3 lg:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white">
            <Image src="/stsa-logo.png" alt="STSA Church" fill sizes="32px" className="object-cover" />
          </div>
          <div className="font-heading text-[15px] font-semibold leading-tight text-brand-cream">
            {appName}
          </div>
        </Link>
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
          className="rounded p-1.5 text-brand-cream"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile drawer + backdrop */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="relative flex h-full w-[248px] max-w-[85vw] flex-col bg-brand-navy px-5 py-7">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-3 rounded p-1.5 text-brand-cream"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              user={user}
              appName={appName}
              pathname={pathname}
              onNavigate={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Bottom tab bar — primary mobile nav (ADR-0019 Phase 3). The
          safe-area padding keeps tap targets clear of the home indicator on
          notch-style iPhones; viewport's viewportFit: "cover" (app/layout.tsx)
          is what makes env(safe-area-inset-bottom) resolve to something
          nonzero in the first place. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-white/10 bg-brand-navy pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Primary"
      >
        {bottomTabs.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold transition-colors ${
                active ? "text-brand-sky" : "text-[#8FA1B2]"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          aria-label="More"
          onClick={() => setDrawerOpen(true)}
          className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold transition-colors ${
            moreActive ? "text-brand-sky" : "text-[#8FA1B2]"
          }`}
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>

      {/* Desktop rail — always visible at `lg` and up. */}
      <aside className="hidden w-[248px] shrink-0 flex-col bg-brand-navy px-5 py-7 lg:flex">
        <SidebarContent user={user} appName={appName} pathname={pathname} />
      </aside>
    </>
  );
}
