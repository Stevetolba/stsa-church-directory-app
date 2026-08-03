# ADR-0019: Ship a native iOS/Android app as a Capacitor shell over the existing Vercel deployment

**Status:** Accepted
**Date:** 2026-07-27

## Context

Two things need a native app that the web app fundamentally cannot provide:

1. **Direct, silent label printing.** Every attempt in this project to print reliably from iOS Safari (`window.print()` on live HTML, on a captured image, via a hidden-iframe PDF, via the OS share sheet) hit a real platform ceiling — AirPrint doesn't respect `@page` sizing from a webpage, and there is no browser API that talks to a label printer's own SDK. A native app can.
2. **App Store / Google Play presence**, so staff install from a store instead of "Add to Home Screen."

## Decision

Build the native app with **Capacitor**, as a **thin native shell whose WebView loads the existing deployed Vercel app**, augmented with native plugins for exactly the capabilities a WebView lacks (printer SDK, native Google sign-in, push, secure storage). This is *not* a bundled static Capacitor build.

**Why not a bundled static build (`output: "export"`):** not viable for this app. It is blocked simultaneously by:
- Server Components doing request-time data fetching on nearly every route (`lib/subsplash.ts`, `auth()`).
- Server Actions (`app/(auth)/login/actions.ts`, `app/(dashboard)/actions.ts`).
- `middleware.ts` (Auth.js Edge redirects).
- `next-auth` v5's cookie/session flow.
- ~30 `app/api/*` route handlers — the actual backend.
- `next/image` optimization (`sharp`).

Converting all of that to a static-exportable client+API shape first would be a large rewrite gating the entire project before a single native feature shipped.

**Why not React Native/Expo:** would mean maintaining a second front-end (a full UI rebuild), directly working against "changes are easy via one PR" — a merged PR would need to update two codebases, or the RN app would drift behind web.

**The shell approach's central trade-off:** because a merged PR to `main` updates the live Vercel app, and the native shell always loads that same origin, **every PR ships to web and the native app simultaneously with no store resubmission** — exactly the workflow this project already has. Only native-code changes (a new plugin, a new native permission) require a new store build, and those are rare relative to ordinary feature PRs.

## Consequences

- **Printing (the headline feature) becomes a native SDK call, not a browser workaround.** `@rdlabo/capacitor-brotherprint`'s `printImage({ encodedImage })` sends a base64 PNG straight to the printer over its own connection — no OS print dialog. This reuses the *existing* PNG-capture pipeline (`components/labels/PrintLabelsSheet.tsx`'s `captureLabelImage`) almost verbatim (see `lib/nativePrint.ts`); the `pdf-lib`/`navigator.share` chain remains the *web* fallback, gated on `Capacitor.isNativePlatform()`.
- **Kiosk check-in works with zero backend changes.** `app/kiosk/*` already authenticates via a device-token cookie (`lib/deviceAuth.ts`, ADR-0015), not Google OAuth — so it works inside the shell's WebView immediately, since cookies for the loaded origin behave normally. This makes kiosk + printing the lowest-risk, highest-value first slice to get working end-to-end.
- **Primary staff/admin auth needs new work.** `next-auth` v5's Google OAuth redirect does not survive a Capacitor WebView round-trip (cookies set during the external redirect aren't visible back in the app). The fix is a native Google Sign-In plugin bridged to a new `/api/auth/native` route that verifies the native ID token, reuses the *existing* role-resolution logic (`lib/roles.ts`, `lib/subsplash.ts`'s `getDirectoryRole`/`hasDirectoryAccess` — unchanged), and mints the same Auth.js session cookie for the Vercel origin.
- **Apple's Guideline 4.2** ("minimum functionality") scrutinizes webview-style apps. Mitigated by shipping genuine native capability in the same release: direct printer-hardware integration, native sign-in, push notifications, and touch-native navigation (bottom tabs replacing the current "stopgap, not a mobile redesign" drawer — `components/Sidebar.tsx:16-19`) — not a bare wrapper.
- **Version skew:** new web code that calls a new native plugin must feature-detect it (`Capacitor.isPluginAvailable(...)`) so a user on an older installed binary degrades gracefully rather than crashing.
- **All existing backend/business logic is untouched** — `lib/subsplash.ts`, `lib/attendance.ts`, every `app/api/**` route, the Vercel deploy pipeline, and the label *data* shapes (`ChildLabelData`/`ParentMatchTagData`) are reused as-is.

## Alternatives rejected

- **React Native / Expo rebuild.** Best native feel and lowest 4.2 risk, but a second UI codebase to maintain — rejected given the explicit goal of shipping changes through one PR.
- **Bundled static Capacitor export.** Requires re-architecting every server-rendered page to client+API before launch — rejected as front-loading too much work before any native benefit ships.
- **PWA-only, no native shell.** Already technically possible (the app is an installable PWA today) and cheapest, but iOS PWAs cannot access Bluetooth/local-network printer hardware and have no App Store presence — rejected because it cannot deliver either of the two goals in Context.
