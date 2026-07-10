# ADR-0009: Cache the full Subsplash profiles/households walk

**Status:** Accepted
**Date:** 2026-07-10

## Context

ADR-0004's amendment already flagged the trigger for this decision: "if the directory grows large enough that re-fetching from Subsplash on every search becomes slow, introduce a short-TTL server-side cache." Wiring `SUBSPLASH_USE_MOCK=false` against the real org for the first time (Step 15) hit that trigger immediately — confirmed against the live API rather than projected:

- The org has 4,000+ profiles (walk stopped early to avoid hammering production further; the real count is higher).
- `fetchAllProfilesFromSubsplash`/`fetchAllHouseholdsFromSubsplash` walk every page on every call, since ADR-0004's filtering happens in memory after the fetch. Against this much data, Dashboard/People/Households page loads took 15-40+ seconds.
- This also re-hit Subsplash for the full roster on every single page view, not just once — expensive and slow on every request, not just the first.

Two more real-API gaps surfaced during the same verification pass and are also fixed by this change's code, though they're independent of the caching decision itself:

- Every real request needs `filter[org_key]=<org key>` or Subsplash returns 400 "an org_key filter is required." `SUBSPLASH_ORG_KEY` existed in env config since Step 1 but was never actually used in `lib/subsplash.ts` until now.
- Collection-type embeds (`_embedded.members` on a household, `_embedded.latest-membership-status-change` on a profile) are stub/absent by default and need explicit `include=` query params — confirmed by direct API calls, not just documentation. Without `include=latest-membership-status-change`, every real profile silently fell back to `mapProfile`'s "Visitor" default.

Re-litigating ADR-0004's core question — could search be pushed to Subsplash's real filters instead of caching a full walk — confirmed the original amendment's finding still holds and is now empirically worse than assumed:

- `filter[first_name]`, `filter[last_name]`, `filter[email]`, `filter[phone]` are exact-match only (`openapi.yaml`: "Wildcards not supported") — no substring/prefix search, so the mockup's single free-text "search by name, email, or phone" box cannot be expressed as Subsplash queries at all, only as a set of exact-match lookups.
- Membership status (Visitor/Newcomer/Regular Attendee/Member/Former Attender) has no Subsplash filter parameter — it's only readable via the `latest-membership-status-change` embed, never filterable.
- Campus (a custom field) has no filter parameter either.

Matching the UI to what Subsplash can actually filter would mean dropping substring search and the status/campus filter pills entirely — a real feature regression, not a neutral implementation swap.

## Decision

Cache the results of `fetchAllProfilesFromSubsplash` and `fetchAllHouseholdsFromSubsplash` for 5 minutes (`CACHE_REVALIDATE_SECONDS`) so `searchProfiles`/`listHouseholds` read from memory instead of re-walking Subsplash on every request. `getProfile`/`getHousehold` (single-ID lookups) stay uncached, so a profile/household detail page always reflects the latest PATCH immediately.

The households walk no longer requests `include=members` — that embedded every member's full profile inside every household, which is redundant with the separately-cached profiles list and, at this org's size, is what caused the first cache implementation to fail (see below). `listHouseholds()` instead joins each household's members from the cached profiles list by `household_id`, the same approach mock mode already used.

After a successful `updateProfile`/`updateHousehold` PATCH, the relevant cache is invalidated (set to `null`, forcing the next read to refetch) so an admin's own edit is visible in the list immediately rather than waiting out the 5-minute window.

Concurrent requests during a cold cache (startup, or right after the TTL lapses under real traffic) share one in-flight walk rather than each independently re-fetching thousands of records — confirmed happening in practice during verification (one request took 25s despite another having just warmed the cache moments earlier).

### Unrelated bug also found during this verification pass

`PersonCard` (the People list's card component) had no `<Link>` to the profile detail page at all, in both mock and real mode — clicking a card did nothing. Not a caching or real-API issue; a pre-existing gap that only surfaced because this was the first time cards were click-tested rather than navigated to directly by URL. Fixed alongside this ADR's changes since it blocks the same verification pass, not because it's part of the caching decision.

### Implementation note: `unstable_cache` doesn't work here

The first implementation wrapped both walks in Next.js's `unstable_cache` (`next/cache`), reasoning that its Vercel Data Cache backing would persist across serverless invocations (unlike a plain module variable) — a real constraint the original ADR-0004 amendment's "short-TTL server-side cache" language didn't address. Verifying against the real org immediately broke this: `unstable_cache` has a hard 2MB limit per cache entry, and the mapped profiles list alone is ~3MB at this org's size (4,000+ profiles). It fails by throwing an async `unhandledRejection` rather than blocking the response, so pages still rendered — just never actually got cached, silently falling back to a full walk on every request, exactly the problem this ADR exists to fix.

Replaced with a plain in-memory TTL cache — the same pattern `lib/subsplashToken.ts` already uses for the service token — which has no size ceiling since it never serializes through Next's Data Cache.

## Consequences

- Steady-state page loads are fast (served from memory) instead of walking thousands of records on every request.
- Directory data can be up to 5 minutes stale for other users after someone else's edit (mitigated for the editor's own change via the cache-invalidation-on-write above).
- The first request after each cache expiry still pays the full walk's cost (a "cold cache" 15-40s spike). Not solved here — acceptable for a low-traffic staff tool, but a candidate follow-up (e.g. a Vercel Cron hitting a revalidation endpoint every 5 minutes so users never hit a cold cache) if it proves annoying in practice.
- Unlike `unstable_cache`, a plain module-level cache is **not** guaranteed to persist across Vercel serverless invocations — it only survives within a warm, reused instance. At this app's expected traffic (a small church staff tool), Vercel typically keeps a small number of instances warm, so in practice this should still cut most repeated walks, but it's a real, accepted tradeoff versus a proper shared cache (KV/Redis) — revisit if cold-start frequency in production makes this ineffective.
- `MAX_SUBSPLASH_PAGES` raised from 100 to 200 (20,000 profiles) for headroom, now that walking it only happens once per revalidation window rather than once per request.

## Alternatives rejected

- **Match the UI to Subsplash's real filter limits** (exact-match-only search, drop status/campus filtering). Same rejection as ADR-0004: a real, visible feature regression for no necessity, since caching solves the actual performance problem without giving up any verified functionality.
- **`unstable_cache`.** Tried first; rejected after hitting its 2MB per-entry limit against the real data size (see implementation note above).
- **A dedicated KV/DB-backed cache or sync job.** Would survive cold starts and support true real-time invalidation, but is new infrastructure this app doesn't otherwise need. Revisit if the in-memory cache's cold-start behavior proves unacceptable in production.
- **Shorter revalidate window (e.g., 60s).** Would reduce staleness but increases how often the expensive cold-cache walk runs under real traffic. 5 minutes is a starting point, not a load-bearing constant — tune via `CACHE_REVALIDATE_SECONDS` if usage patterns call for it.
