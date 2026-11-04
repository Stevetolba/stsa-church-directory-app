import Image from "next/image";
import Link from "next/link";
import { getHouseholdSession } from "@/lib/householdSession";
import { signOutHouseholdAction } from "./actions";

export const metadata = { title: "Update your household — STSA Church" };
// Reads a cookie, so never statically cached.
export const dynamic = "force-dynamic";

export default function HouseholdLayout({ children }: { children: React.ReactNode }) {
  const session = getHouseholdSession();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-brand-sky/20 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/household-update" className="flex items-center gap-3">
            <span className="relative h-9 w-9 overflow-hidden rounded-full bg-white">
              <Image src="/stsa-logo.png" alt="STSA Church" fill sizes="36px" className="object-cover" />
            </span>
            <span className="font-heading text-lg font-semibold text-brand-navy">Household update</span>
          </Link>
          {session && (
            <form action={signOutHouseholdAction}>
              <button type="submit" className="text-sm text-muted-foreground underline">
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
