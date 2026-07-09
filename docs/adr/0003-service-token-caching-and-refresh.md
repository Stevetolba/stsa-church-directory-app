# ADR-0003: Service token caching & refresh

**Status:** Accepted
**Date:** 2026-07-09

## Context

The Subsplash `client_credentials` token response includes `expires_in` (seconds) and `token_type`, but no refresh token. Re-minting a token on every request is wasteful and risks hitting Subsplash's rate limits on the token endpoint.

## Decision

Cache the service token server-side in memory, keyed by nothing (there is exactly one service credential for the whole app). Re-mint via `client_credentials` when the cached token is within ~60 seconds of expiry. Wrap this in a single `getServiceToken()` function, used by every call the Subsplash client makes.

## Consequences

- On serverless (Vercel), memory isn't shared across invocations, so each cold instance mints its own token on first use — acceptable at this app's scale.
- If Subsplash starts rate-limiting token creation because of cold-start churn, move the cache to a short-TTL KV store (Vercel KV / Upstash). This is a scaling follow-up, not a v1 blocker, and should get its own ADR if/when it happens.

## Alternatives rejected

- **Mint a fresh token per request.** Simple but wasteful and rate-limit risky; rejected in favor of caching.
- **KV-backed cache from day one.** Adds an infrastructure dependency before there's evidence it's needed. Deferred until in-memory caching proves insufficient.
