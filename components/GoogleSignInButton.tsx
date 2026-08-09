"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { signInWithGoogle, signInWithNativeGoogle } from "@/app/(auth)/login/actions";
import { initializeNativeGoogleSignIn, isNativeGoogleSignInAvailable, signInNativeGoogle } from "@/lib/nativeAuth";

// ADR-0021: renders the same web OAuth form (signInWithGoogle, the original
// behavior) by default — both server-rendered and on the client's first
// render — since whether the app is running inside the native shell can
// only be known client-side (Capacitor.isNativePlatform() reads `window`).
// Swapping to the native button happens after mount instead of during the
// initial render, the same "start as web, upgrade if native" trade-off
// lib/nativePrint.ts's printing path already makes, to avoid a
// server/client hydration mismatch here (this component IS part of the
// initial SSR payload, unlike PrintLabelsSheet's client-triggered mount).
export function GoogleSignInButton() {
  const [native, setNative] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!isNativeGoogleSignInAvailable()) return;
    setNative(true);
    // Kicked off as soon as we know we're native, so the SDK is ready
    // before the user taps rather than adding a delay to the first tap.
    initializeNativeGoogleSignIn().catch(() => {
      // Surfaced again (as a toast) if the user actually taps the button —
      // nothing useful to show before that.
    });
  }, []);

  if (!native) {
    return (
      <form action={signInWithGoogle} className="mt-8">
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-white px-4 py-3 text-sm font-semibold text-brand-navy shadow-sm transition hover:bg-brand-cream"
        >
          <GoogleIcon />
          Sign in with Google
        </button>
      </form>
    );
  }

  async function handleNativeSignIn() {
    setPending(true);
    try {
      const idToken = await signInNativeGoogle();
      await signInWithNativeGoogle(idToken);
    } catch (e) {
      // AbortError-style cancellations (the user closed the native sign-in
      // sheet without picking an account) aren't a real failure — nothing
      // to report. Anything else means the token step or the server-side
      // admission check failed.
      if (e instanceof Error && e.name !== "AbortError") {
        toast.error("Could not sign in with Google — please try again.");
      }
      setPending(false);
    }
    // No `finally` resetting `pending`: a successful sign-in redirects away
    // (signInWithNativeGoogle's redirectTo) before this would matter.
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={handleNativeSignIn}
        disabled={pending}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-white px-4 py-3 text-sm font-semibold text-brand-navy shadow-sm transition hover:bg-brand-cream disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleIcon />
        {pending ? "Signing in…" : "Sign in with Google"}
      </button>
    </div>
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
