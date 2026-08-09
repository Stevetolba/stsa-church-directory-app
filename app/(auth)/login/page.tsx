import Image from "next/image";
import Link from "next/link";
import { Tablet } from "lucide-react";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

// Auth.js appends ?error=<code> to pages.error on failure — pointed at this
// same page (lib/auth.config.ts), rather than its own plain built-in error
// page, which is what shows up if that config is missing. AccessDenied is
// what our signIn callback (lib/auth.ts) produces when an account is
// neither on the church Workspace domain nor an approved volunteer
// (ADR-0010), since it returns false rather than throwing.
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "That Google account isn't recognized. Staff should sign in with their church Workspace email; volunteers need directory access enabled by the church office first.",
  Configuration:
    "Sign-in isn't configured correctly right now. Contact the church office if this keeps happening.",
  Default: "Something went wrong signing in. Please try again.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const errorMessage = searchParams.error
    ? (ERROR_MESSAGES[searchParams.error] ?? ERROR_MESSAGES.Default)
    : null;

  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "STSA Church Directory";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-brand-sky/20 bg-card p-8 text-center shadow-sm">
        <div className="relative mx-auto mb-4 h-14 w-14 overflow-hidden rounded-full bg-white">
          <Image src="/stsa-logo.png" alt="STSA Church" fill sizes="56px" className="object-cover" />
        </div>
        <h1 className="font-heading text-2xl font-semibold text-brand-navy">{appName}</h1>
        <p className="mt-1 text-sm uppercase tracking-wide text-muted-foreground">People Directory</p>

        {errorMessage && (
          <p className="mt-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <GoogleSignInButton />

        <p className="mt-6 text-xs text-muted-foreground">
          Staff — sign in with your church Google Workspace email.
          <br />
          Volunteers — sign in with your personal email address.
        </p>

        <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Setting up a self-service check-in tablet doesn't need a sign-in
            at all (ADR-0015 Phase 3) — /kiosk resolves an already-claimed
            device straight to its event(s), or sends a fresh device to
            /kiosk/setup for its one-time code. */}
        <Link
          href="/kiosk"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-3 text-sm font-semibold text-brand-navy shadow-sm transition hover:bg-brand-cream"
        >
          <Tablet className="h-4 w-4" />
          Set up or open kiosk mode
        </Link>
      </div>
    </main>
  );
}
