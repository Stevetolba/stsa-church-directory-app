import { getHouseholdSession } from "@/lib/householdSession";
import { signOutHouseholdAction } from "./actions";

export const metadata = { title: "Update your household — STSA Church" };
// Reads a cookie, so never statically cached.
export const dynamic = "force-dynamic";

// No app header: these pages are embedded in the Subsplash mobile app, which
// supplies its own chrome. Only a small sign-out link remains.
export default function HouseholdLayout({ children }: { children: React.ReactNode }) {
  const session = getHouseholdSession();
  return (
    <div className="min-h-screen bg-white">
      {/* The root layout paints the page cream; make the whole page white so
          nothing cream shows in the embedded view (overscroll, short pages). */}
      <style>{"html,body{background:#fff}"}</style>
      <main className="mx-auto max-w-2xl px-4 py-6">
        {session && (
          <form action={signOutHouseholdAction} className="mb-4 flex justify-end">
            <button type="submit" className="text-sm text-muted-foreground underline">
              Sign out
            </button>
          </form>
        )}
        {children}
      </main>
    </div>
  );
}
