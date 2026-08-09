// Native Google Sign-In (Capacitor phase 2, ADR-0021) — bridges Google's own
// native Sign-In SDK into an Auth.js session via the "native-google"
// Credentials provider (lib/auth.ts). Needed because the web OAuth
// redirect flow (accounts.google.com) can't run inside the shell's WebView
// (capacitor.config.ts pins ios.limitsNavigationsToAppBoundDomains, and even
// without that, a WebView-hosted Google sign-in page is exactly what Google
// blocks as a suspicious embedded browser).
//
// Safe to import from any client component regardless of whether the app is
// actually running inside the native shell — @capacitor/core and this
// plugin both ship a web fallback that no-ops/rejects rather than crashing,
// as long as nothing here is *called* without first checking
// isNativeGoogleSignInAvailable(), matching lib/nativePrint.ts's pattern.
"use client";

import { Capacitor } from "@capacitor/core";
import { GoogleSignIn } from "@capawesome/capacitor-google-sign-in";

export function isNativeGoogleSignInAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("GoogleSignIn");
}

// Google's native SDKs mint ID tokens against a single "web" OAuth client
// regardless of platform (the iOS/Android client ids configured natively —
// GIDClientID in Info.plist — only drive the on-device sign-in UI, not the
// token's audience) — so this is the same AUTH_GOOGLE_ID the web OAuth
// provider already uses, just exposed to the client bundle since
// initialize() runs in the browser/WebView, not on the server.
const WEB_CLIENT_ID = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ID;

let initialized: Promise<void> | null = null;

// Idempotent — safe to call from more than one mounted component. Actual
// GoogleSignIn.initialize() calls are cheap and safe to repeat, but this
// avoids doing it more than once per page load regardless.
export function initializeNativeGoogleSignIn(): Promise<void> {
  if (!initialized) {
    if (!WEB_CLIENT_ID) {
      initialized = Promise.reject(new Error("NEXT_PUBLIC_AUTH_GOOGLE_ID is not configured"));
    } else {
      initialized = GoogleSignIn.initialize({ clientId: WEB_CLIENT_ID });
    }
  }
  return initialized;
}

// Returns the ID token to hand to signIn("native-google", { idToken }) —
// the actual admission decision happens server-side (lib/auth.ts), this is
// just the on-device identity step.
export async function signInNativeGoogle(): Promise<string> {
  await initializeNativeGoogleSignIn();
  const result = await GoogleSignIn.signIn();
  if (!result.idToken) {
    throw new Error("Google did not return an ID token");
  }
  return result.idToken;
}
