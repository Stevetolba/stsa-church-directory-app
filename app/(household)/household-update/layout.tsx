import Image from "next/image";
import Link from "next/link";
import { getHouseholdSession } from "@/lib/householdSession";
import { signOutHouseholdAction } from "./actions";

export const metadata = { title: "Update Profile — STSA Church" };
// Reads a cookie, so never statically cached.
export const dynamic = "force-dynamic";

export default function HouseholdLayout({ children }: { children: React.ReactNode }) {
  const session = getHouseholdSession();
  return (
    <div className="min-h-screen bg-white">
      {/* The root layout paints the page cream; keep the whole page white so
          nothing cream shows in the embedded view (overscroll, short pages). */}
      <style>{"html,body{background:#fff}"}</style>
      {/* Same navy top bar as the staff app's mobile header. */}
      <header className="bg-brand-navy">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/household-update" className="flex items-center gap-2.5">
            <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white">
              <Image src="/stsa-logo.png" alt="STSA Church" fill sizes="32px" className="object-cover" />
            </span>
            <span className="font-heading text-[15px] font-semibold leading-tight text-brand-cream">Update Profile</span>
          </Link>
          {session && (
            <form action={signOutHouseholdAction}>
              <button type="submit" className="text-[13px] text-[#B9C4CF] transition-colors hover:text-brand-cream">
                Sign out
              </button>
            </form>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
