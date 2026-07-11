# ADR-0009: Cache the full Subsplash profiles/households walk

**Status:** Accepted (amended 2026-07-10 — see Amendment below)
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
- **A dedicated KV/DB-backed cache or sync job.** Would survive cold starts and support true real-time invalidation, but is new infrastructure this app doesn't otherwise need given the amendment below made `unstable_cache` viable. Revisit if the amended approach's cold-start behavior proves unacceptable in production.
- **Shorter revalidate window (e.g., 60s).** Would reduce staleness but increases how often the expensive cold-cache walk runs under real traffic. 5 minutes is a starting point, not a load-bearing constant — tune via `CACHE_REVALIDATE_SECONDS` if usage patterns call for it.

## Amendment (2026-07-10, same day) — back to `unstable_cache`, chunked

The plain in-memory cache above shipped, got deployed to Vercel, and the very next real-user report was "still there is API latency." The predicted risk in Consequences was exactly right: a plain module-level variable doesn't reliably persist across Vercel's serverless invocations, so most requests in production were still hitting a cold cache and paying the full walk's cost — the opposite of what this ADR set out to fix.

The actual fix: go back to `unstable_cache` (which *does* persist via Vercel's Data Cache), but avoid the earlier 2MB-per-entry failure by caching **per page** instead of the whole collection in one entry:

- `getCachedProfilePage(page)` wraps a single page's fetch+map in `unstable_cache`, keyed by page number. Each page (~100 profiles, ~70KB mapped) is comfortably under the 2MB limit. `getCachedProfiles()` walks pages calling this cached fetcher instead of a raw one.
- Households don't need chunking — without embedded members (see above), the whole collection maps to roughly 1MB even at 3,883 households, safely under the limit as a single `unstable_cache` entry.
- Cache invalidation on write went back to `revalidateTag("subsplash-profiles")` / `revalidateTag("subsplash-households")`, which correctly invalidates every chunk sharing that tag, not just one.

This supersedes the "Implementation note" and part of "Consequences" above: `unstable_cache` was rejected too hastily on the first pass, for hitting a size limit that was a consequence of the specific payload shape (whole collection, and households embedding full member profiles) rather than an inherent limit of `unstable_cache` itself. Chunking and de-duplicating the households payload (see the "no `include=members`" note above) both independently fix the size problem, and together they let the intended tool for this job — a cache that actually persists on serverless — work as intended.

### Two more real-data bugs found in the same round of reports

Not caching-related, but surfaced by the same "why is real data still wrong" investigation, so noted here for the record:

- **Campus filtering returned zero results for every campus.** `extractCampus`/`extractCustomFieldValue` assumed a custom field's selected value lives at `value.choice` (singular). The real org's Campus field is multi-select and returns `value.choices` (an array) — confirmed a profile can even have both Arlington and Leesburg selected simultaneously. `value.choice` was never populated for any real profile, so `campus` was silently `undefined` everywhere, and filtering by campus matched nothing.
- **Every household member showed "Visitor" regardless of actual status**, even after the `include=latest-membership-status-change` fix on the profiles walk. `getHousehold()`'s `include=members` embed (confirmed via direct API calls, including nested-include attempts like `include=members,members.latest-membership-status-change`) never carries that embed on the member stubs it returns. Fixed by enriching `getHousehold()`'s members from the (already-correct, already-cached) profiles list by id, the same join pattern `listHouseholds()` already used.

### Three more real-data bugs found verifying the Edit Profile save flow end-to-end

Found and fixed together, verified with a real (reversible) write against a real profile with the profile owner's explicit go-ahead:

- **`getHousehold()` never requested `include=address`**, so any household with a real address on file showed it as blank in the app (both the Household Detail page and the Edit Profile form's address field) — confirmed against a household that had a real address dating to 2024 that the app had never once displayed. `fetchAllHouseholdsFromSubsplash` had the same gap for the Households list. Fixed by adding `include=address` (or `include=members,address` for the single-item fetch) alongside the existing `include=members`.
- **Editing a profile always failed, regardless of which field actually changed.** Root cause was two stacked bugs: (1) the Campus `<select>` always submits a defined value (it has a default), and `updateProfile`'s real-mode branch throws for any defined campus value since real campus edits aren't implemented yet — so saving name/email/phone/address all failed with a generic error even when campus was untouched. Fixed by only including `campus` in the PATCH body when it actually changed. (2) Once campus was correctly omitted, `editProfileSchema`'s `campus` field (a non-optional `z.enum`) rejected the *absence* of campus as invalid input — the schema was never built to allow an omitted campus. Fixed by making it `.optional()`.
- **Even with both of those fixed, any save that included a phone number still 400'd against Subsplash specifically** (not our own validation). `phone_number` in Subsplash's `ProfileRequest` PATCH schema is `PhoneNumberWithCountryCode` (`{ significant, country: { calling_code, region_code } }`), not the formatted display string ("(215) 940-5960") the UI shows and edits. `updateProfile` was sending the display string straight through. Fixed with `phoneNumberForSubsplash()`, which parses the 10-digit US number back into the structured shape before the real-mode PATCH (this app's users are all in one US-based church, so no other formats are handled — an unrecognized digit count throws rather than guessing a country code).
