// Server-only. Mints and caches an OAuth2 access token for the Google
// Calendar service account (ADR-0022), the same shape as
// lib/subsplashToken.ts's getServiceToken: one credential, cached in memory,
// re-minted within 60s of expiry.
//
// No googleapis/google-auth-library dependency — this hand-signs the JWT
// assertion with Node's built-in crypto, matching this codebase's existing
// "raw fetch, no SDK" convention for Subsplash.

import { createSign } from "crypto";

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

const EXPIRY_BUFFER_MS = 60_000;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const ASSERTION_LIFETIME_SECONDS = 3600;

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

// A service account key pasted into an env var commonly arrives with
// literal "\n" escape sequences instead of real newlines (a well-known
// Google service-account gotcha) — normalize either shape.
function normalizePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function signAssertion(clientEmail: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + ASSERTION_LIFETIME_SECONDS,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(normalizePrivateKey(privateKey), "base64url");
  return `${signingInput}.${signature}`;
}

export async function getGoogleCalendarServiceToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - EXPIRY_BUFFER_MS > now) {
    return cachedToken.accessToken;
  }

  const clientEmail = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_CALENDAR_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing Google Calendar service account credentials (GOOGLE_CALENDAR_CLIENT_EMAIL / GOOGLE_CALENDAR_PRIVATE_KEY)"
    );
  }

  const assertion = signAssertion(clientEmail, privateKey);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Failed to mint Google Calendar service token: ${res.status} ${detail}`);
  }

  const data = (await res.json()) as TokenResponse;
  cachedToken = { accessToken: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return cachedToken.accessToken;
}
