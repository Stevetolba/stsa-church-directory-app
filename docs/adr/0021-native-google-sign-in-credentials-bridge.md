# ADR-0021: Bridge native Google Sign-In into Auth.js via a Credentials provider, not a hand-minted session cookie

**Status:** Accepted
**Date:** 2026-08-09

## Context

ADR-0019 identified that `next-auth` v5's Google OAuth redirect can't survive a Capacitor WebView round-trip — cookies set during the external `accounts.google.com` redirect aren't visible back in the app, and `capacitor.config.ts` deliberately pins `ios.limitsNavigationsToAppBoundDomains` so the WebView can't follow that redirect at all. ADR-0019 sketched the fix as "a native Google Sign-In plugin bridged to a new `/api/auth/native` route that verifies the native ID token... and mints the same Auth.js session cookie for the Vercel origin."

Building that literally — hand-encoding a JWE session cookie with `@auth/core/jwt`'s `encode()` and setting it directly — means reimplementing Auth.js v5's own cookie format (name, `__Secure-` prefixing, HKDF-derived encryption key, payload shape) outside its own request pipeline. That shape isn't officially documented as a stable public contract, and drifting from it on a future `next-auth` upgrade would silently break native sign-in with no compile-time signal.

## Decision

Add a second Auth.js provider — a `Credentials` provider with id `"native-google"` — instead of a hand-rolled cookie-minting route. The native shell still does its own identity step (Google's native Sign-In SDK, not a WebView redirect), but handing the resulting ID token to Auth.js's own `signIn("native-google", { idToken })` means the *entire* rest of the pipeline (cookie encoding, name, `__Secure-` prefixing, CSRF token handling, redirect handling) is Auth.js's own code, not a reimplementation of it.

- `lib/auth.ts`: `NativeGoogle`'s `authorize({ idToken })` verifies the token server-side with `google-auth-library`'s `OAuth2Client.verifyIdToken()`, checking `audience` against `AUTH_GOOGLE_ID` — the same "Web" OAuth client the existing `Google` provider already uses. Google's native Sign-In SDKs mint ID tokens against a single configured web client regardless of platform (the iOS/Android-type client ids configured natively only drive the on-device sign-in UI), so no separate native client id needs to be trusted server-side — one audience check, same as if the token had come from the web flow.
- The existing `signIn` callback's admission logic (workspace-domain check, `ADMIN_EMAILS`, Subsplash `DirectoryAccess`/`DirectoryRole` lookup, `recordAccessEvent` logging — ADR-0001/0010/0016/0017) is factored into a shared `evaluateAdmission()` function, called from both `authorize()` (native) and the OAuth `signIn` callback (web) — one source of truth for who's allowed in, not two copies that could drift.
- `lib/nativeAuth.ts` (client-side): wraps `@capawesome/capacitor-google-sign-in`, mirroring `lib/nativePrint.ts`'s established pattern — `isNativeGoogleSignInAvailable()` feature-detects via `Capacitor.isNativePlatform()` + `isPluginAvailable`, safe to import from any client component regardless of platform.
- `components/GoogleSignInButton.tsx`: renders the original web `<form action={signInWithGoogle}>` by default (both server-rendered and on first client render, since native-ness can only be known client-side) and swaps to a native button *after mount* — avoiding a hydration mismatch, unlike `PrintLabelsSheet`'s native/web branch, which never needs the mounted-guard because it only ever mounts client-side after a check-in action, not as part of the initial SSR payload.
- `app/(auth)/login/actions.ts` gains `signInWithNativeGoogle(idToken)`, a thin wrapper around `signIn("native-google", { idToken, redirectTo: "/" })` — same shape as the existing `signInWithGoogle`.

## Consequences

- No hand-rolled JWT/JWE encoding anywhere in this codebase — a future `next-auth` upgrade that changes its internal cookie format needs zero changes here, since both providers go through the same `NextAuth(...)` instance's own cookie-issuing code.
- The web OAuth path (`signIn` callback, `jwt` callback, `session` callback) is unchanged in behavior — `evaluateAdmission()` is a faithful extraction of the exact same checks, in the exact same order, not a rewrite.
- One real manual setup step this ADR can't complete on its own: the iOS shell needs its *own* "iOS"-type OAuth client registered in Google Cloud Console (for `GIDClientID` + the reversed-client-id URL scheme in `Info.plist`) — that only drives the native sign-in UI/redirect, not the token audience the server checks, but it has to exist for the SDK to run at all. `ios/App/App/Info.plist` has a clearly-marked `REPLACE_WITH_IOS_CLIENT_ID` placeholder pending that. Android needs the equivalent (SHA-1 fingerprint registered against an Android-type client) before `npx cap add android` in a later phase.
- A native sign-in rejected by `evaluateAdmission()` (not on the allow-list) currently surfaces as a generic "Could not sign in with Google" toast, not the contextual `AccessDenied` copy the web `/login?error=AccessDenied` banner shows — Auth.js's `AuthError` subclasses don't cleanly survive the Server Action → Client Component boundary. Acceptable for a first pass; worth revisiting if it causes real confusion in practice.

## Alternatives rejected

- **Hand-mint the session cookie in a plain route handler** (ADR-0019's original sketch). Rejected per Context above — reimplements an internal, not-guaranteed-stable Auth.js format outside its own pipeline.
- **`next-auth/react`'s client-side `signIn()` with a `SessionProvider`.** Would also work, but this app has no `SessionProvider` anywhere today (every existing sign-in is a Server Action bound to a `<form>`) — adding one just for this one code path is more surface area than calling the existing Server Action pattern (`signInWithGoogle`'s own shape) imperatively from a client event handler, which Next.js already supports without a form.
