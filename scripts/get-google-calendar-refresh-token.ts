#!/usr/bin/env -S npx tsx
// One-time OAuth consent flow to mint a refresh token for the Google
// Calendar sync (ADR-0022). Used instead of a service-account key because
// this org's GCP policy (iam.disableServiceAccountKeyCreation) blocks
// creating those — a refresh token from a regular OAuth client isn't a
// service-account key, so that policy doesn't apply here.
//
// Run this ONCE, signed in as whichever Google account should own the
// calendar edits (it needs "Make changes to events" on the target
// calendar, via Calendar Settings → Share with specific people). It opens
// a local server on 127.0.0.1, tries to launch the consent URL in your
// default browser automatically (falling back to just printing it if that
// fails), and once you approve, prints the resulting refresh_token — paste
// that into GOOGLE_CALENDAR_REFRESH_TOKEN. Never sent anywhere but your own
// terminal and Google's own token endpoint.
//
// Usage:
//   nvm use 24
//   GOOGLE_CALENDAR_CLIENT_ID=... GOOGLE_CALENDAR_CLIENT_SECRET=... \
//     npx tsx scripts/get-google-calendar-refresh-token.ts
//
// GOOGLE_CALENDAR_CLIENT_ID/SECRET come from Google Cloud Console →
// APIs & Services → Credentials → Create Credentials → OAuth client ID →
// "Desktop app" (NOT a service account). A Desktop-app client is allowed to
// redirect to any http://127.0.0.1:<port> without pre-registering the exact
// port, which is what lets this script listen on an arbitrary local port.

import { createServer } from "node:http";
import { execFile } from "node:child_process";

// Best-effort only — some environments (headless/CI, an unrecognized
// platform, no default browser configured) can't open one at all, and the
// printed URL right above this call is always the real fallback.
function tryOpenBrowser(url: string): void {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  execFile(opener, [url], () => {
    // Ignore failures — the URL is already printed above for manual use.
  });
}

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function parseArgs() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const problems: string[] = [];
  if (!clientId) problems.push("GOOGLE_CALENDAR_CLIENT_ID env var is required");
  if (!clientSecret) problems.push("GOOGLE_CALENDAR_CLIENT_SECRET env var is required");
  if (problems.length > 0) {
    console.error("Usage error:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }
  return { clientId: clientId!, clientSecret: clientSecret! };
}

// Waits for the OAuth redirect on a local server, returning the
// authorization code and the exact redirect_uri that was used (needed
// again for the token exchange — it must match exactly).
function waitForAuthorizationCode(clientId: string): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.setHeader("Content-Type", "text/html");

      if (error) {
        res.end(`<p>Authorization failed: ${error}. You can close this tab and check the terminal.</p>`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }
      if (!code) {
        res.end("<p>No authorization code received.</p>");
        return;
      }
      res.end("<p>Authorized — you can close this tab and return to the terminal.</p>");
      const address = server.address();
      const port = address && typeof address !== "string" ? address.port : 0;
      server.close();
      resolve({ code, redirectUri: `http://127.0.0.1:${port}` });
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to start local server"));
        return;
      }
      const redirectUri = `http://127.0.0.1:${address.port}`;
      const authUrl = new URL(AUTH_URL);
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPE);
      // access_type=offline + prompt=consent together are what guarantee a
      // refresh_token comes back even if this Google account already
      // authorized this OAuth client once before.
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");

      console.log("\nOpen this URL, sign in as the Google account that should own the calendar edits, and approve access:\n");
      console.log(authUrl.toString());
      console.log(`\nWaiting for you to finish sign-in (listening on ${redirectUri})...\n`);
      tryOpenBrowser(authUrl.toString());
    });
  });
}

async function main() {
  const { clientId, clientSecret } = parseArgs();
  const { code, redirectUri } = await waitForAuthorizationCode(clientId);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    console.error(`Token exchange failed: ${res.status} ${await res.text().catch(() => "")}`);
    process.exit(1);
  }

  const data = (await res.json()) as { refresh_token?: string; access_token?: string };
  if (!data.refresh_token) {
    console.error(
      "No refresh_token in the response — this Google account may have already authorized this OAuth client " +
        "before, without access_type=offline. Revoke it at https://myaccount.google.com/permissions and re-run " +
        "this script."
    );
    process.exit(1);
  }

  console.log("Success. Set this in your env (.env.local and Vercel):\n");
  console.log(`GOOGLE_CALENDAR_REFRESH_TOKEN=${data.refresh_token}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
