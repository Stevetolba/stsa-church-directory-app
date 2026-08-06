import type { CapacitorConfig } from "@capacitor/cli";

// Native shell config (Phase 0, see docs/adr/0019-native-app-capacitor-shell.md
// for the full architecture rationale). This is NOT a bundled static build —
// output: "export" isn't viable for this app (server components, server
// actions, middleware, next-auth, and ~30 app/api/* routes all require a
// real Next.js server, see that ADR) — so the native shell's WebView loads
// the same deployed Vercel app everyone already uses on the web. A merged
// PR updates the web app AND every installed native app simultaneously, no
// store resubmission, for anything that isn't a native-code change.
//
// webDir is required by the Capacitor CLI even in this remote-URL mode
// (it's where `npx cap sync` would look for local web assets) but is never
// actually served — server.url below takes priority.
const config: CapacitorConfig = {
  // TODO: confirm this is the real production origin (and swap for a custom
  // domain if one gets set up) before the first real device build — this is
  // the URL observed in a physical print test earlier in this project, not
  // read from any env var, since the app has no reason to know its own
  // public URL server-side.
  appId: "church.stsa.directory",
  appName: "STSA Church Directory",
  webDir: "public",
  server: {
    url: "https://stsa-church-directory-app.vercel.app",
    // https (not the default capacitor://) so the WebView's origin matches
    // the real deployment for cookies (session + kiosk device token) to be
    // set/read normally, and so absolute-URL fetches to the same host don't
    // trip cross-origin/mixed-content issues.
    androidScheme: "https",
    cleartext: false,
  },
  ios: {
    // Never navigate away from the app's own origin inside the WebView —
    // OAuth/Google sign-in flows should open in the system browser via a
    // native plugin (Phase 2), not by letting the WebView itself follow the
    // redirect to accounts.google.com.
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;
