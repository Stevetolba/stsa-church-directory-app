import Image from "next/image";
import { signInWithGoogle } from "./actions";

// NextAuth appends ?error=<code> to pages.signIn on failure. AccessDenied
// is what our signIn callback (lib/auth.ts) produces for a non-Workspace
// account, since it returns false rather than throwing.
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "That Google account isn't part of the church's Workspace. Please sign in with your church email address.",
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

  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Church Directory";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-brand-sky/20 bg-card p-8 text-center shadow-sm">
        <div className="relative mx-auto mb-4 h-14 w-14 overflow-hidden rounded-full bg-white">
          <Image src="/stsa-logo.png" alt="STSA Church" fill sizes="56px" className="object-cover" />
        </div>
        <h1 className="font-heading text-2xl font-semibold text-brand-navy">{appName}</h1>
        <p className="mt-1 text-sm uppercase tracking-wide text-muted-foreground">Staff Directory</p>

        {errorMessage && (
          <p className="mt-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <form action={signInWithGoogle} className="mt-8">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-white px-4 py-3 text-sm font-semibold text-brand-navy shadow-sm transition hover:bg-brand-cream"
          >
            <GoogleIcon />
            Sign in with Google
          </button>
        </form>

        <p className="mt-6 text-xs text-muted-foreground">
          Staff only — sign in with your church Google Workspace account.
        </p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.9c1.7-1.57 2.68-3.88 2.68-6.61z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.19l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.69A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.69V4.98H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.02l3-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.98l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}
