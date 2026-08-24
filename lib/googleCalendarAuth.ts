// Server-only. Mints and caches an OAuth2 access token for the Google
// Calendar integration (ADR-0022), via a refresh token rather than a
// service-account key — this org's GCP policy
// (iam.disableServiceAccountKeyCreation) blocks creating service-account
// keys, so a regular OAuth client + refresh token is used instead (a
// refresh token isn't a service-account key, so that policy doesn't apply
// to it). Same caching shape as lib/subsplashToken.ts's getServiceToken:
// module-level cache, re-minted within 60s of expiry.
//
// The refresh token itself is minted once, outside the app, via
// scripts/get-google-calendar-refresh-token.ts — run as whichever Google
// account should own the calendar edits. It doesn't expire on its own
// (only if revoked, unused for 6 months, or the OAuth client's consent
// screen is left in "Testing" publishing status for more than 7 days —
// keep it in "Production" status to avoid that).

const EXPIRY_BUFFER_MS = 60_000;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export async function getGoogleCalendarServiceToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - EXPIRY_BUFFER_MS > now) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Google Calendar OAuth credentials (GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET / GOOGLE_CALENDAR_REFRESH_TOKEN) — run scripts/get-google-calendar-refresh-token.ts to mint a refresh token"
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Failed to refresh Google Calendar access token: ${res.status} ${detail}`);
  }

  const data = (await res.json()) as TokenResponse;
  cachedToken = { accessToken: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return cachedToken.accessToken;
}
