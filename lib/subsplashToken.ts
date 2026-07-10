// Server-only. Mints and caches the Subsplash client_credentials service
// token — ADR-0003. One org-wide credential, cached in memory, re-minted
// within 60s of expiry.

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

const EXPIRY_BUFFER_MS = 60_000;

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export async function getServiceToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - EXPIRY_BUFFER_MS > now) {
    return cachedToken.accessToken;
  }

  const baseUrl = process.env.SUBSPLASH_BASE_URL;
  const clientId = process.env.SUBSPLASH_CLIENT_ID;
  const clientSecret = process.env.SUBSPLASH_CLIENT_SECRET;

  if (!baseUrl || !clientId || !clientSecret) {
    throw new Error(
      "Missing Subsplash service credentials (SUBSPLASH_BASE_URL / SUBSPLASH_CLIENT_ID / SUBSPLASH_CLIENT_SECRET)"
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`${baseUrl}/tokens/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Failed to mint Subsplash service token: ${res.status}`);
  }

  const data = (await res.json()) as TokenResponse;

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return cachedToken.accessToken;
}
