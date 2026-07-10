# ADR-0004: Server-side search, filter & pagination

**Status:** Accepted (amended 2026-07-09 — see Amendment below)
**Date:** 2026-07-09

## Context

The Subsplash profiles endpoint exposes JSON:API-style query params: `filter[first_name]`, `filter[last_name]`, `filter[status]`, `filter[email]`, `filter[phone]`, plus `sort`, `fields[...]`, and `page`. The original spec's "fetch everything, then filter client-side" approach is fine for a handful of records but breaks down as the directory grows.

## Decision

Push all search, filtering, sorting, and pagination to the Subsplash API. The member-list route handler forwards query params through to Subsplash and returns one page at a time. Debounce search input 300ms client-side before it triggers a request.

## Amendment (2026-07-09) — Subsplash can't filter on what the UI needs

Cross-referencing this decision against the real `openapi.yaml` (not available when this ADR was first written) surfaced three gaps between what was assumed pushable to Subsplash and what the API actually supports:

1. **Free-text search.** `filter[first_name]`, `filter[last_name]`, `filter[email]`, `filter[phone]` are all **exact-match — wildcards are explicitly not supported**, and there's no full-text or OR-across-fields search parameter. A single "search by name, email, or phone" box (per the mockup) cannot be expressed as one Subsplash query.
2. **Membership status.** The mockup's status chips (Member / Regular Attendee / Visitor) are not the same thing as Subsplash's `filter[status]` param — that param filters `ProfileStatus` (`active | archived | merged | gdpr | fraud`), a record-lifecycle concept, not a membership category. The real membership category lives in the embedded `latest-membership-status-change.status` (see ADR-0006), which has **no filter parameter** at all.
3. **Campus.** A custom field (confirmed against the org's actual data). Subsplash has no `filter[custom_fields...]` parameter — custom field values can only be read back per-profile, not filtered on server-side.

What Subsplash genuinely supports server-side: pagination (`page[number]`/`page[size]`, max 100/page) and sort (`created_at`, `updated_at`, `first_name`, `last_name`, `email`, `id` only).

### Revised decision

- **Pagination and sort**: pushed to Subsplash directly, as originally decided.
- **Search (name/email/phone substring), status, and campus filtering**: our `/api/profiles` route handler fetches profiles from Subsplash server-side (paginated internally, requesting `custom_fields` and the `latest-membership-status-change` embed via sparse fieldsets), then applies search/status/campus filtering and re-paginates **inside the route handler** before responding to the browser. The browser still never receives the full roster — the filtering step just can't be delegated to Subsplash itself, so it's done on our server instead of theirs.
- No new infrastructure dependency (no database/KV) for v1. This works well at typical single-church scale (hundreds to low thousands of members).
- **Follow-up ADR trigger**: if the directory grows large enough that re-fetching from Subsplash on every search becomes slow, introduce a short-TTL server-side cache — same escalation path as ADR-0003's token-cache follow-up.

## Consequences

- `lib/subsplash.ts` owns the Subsplash→app type mapping (including the campus/custom_fields and membership-status extraction) so the filtering workaround lives in one place.
- The `useMembers` hook still takes `{ search, status, campus, page }`, but that query hits our own route handler, not Subsplash's query string directly.
- Sparse fieldsets (`fields[profiles]=...`) are used when fetching from Subsplash to avoid pulling unnecessary data, even though we can't filter or paginate by everything we need there.

## Alternatives rejected

- **Fetch-then-filter client-side** (original spec). Simple to build but ships the full roster to the browser and doesn't scale.
- **Match the UI to Subsplash's real filter limits** (exact-match search only, drop status/campus filtering). Rejected — it would visibly degrade the mockup's designed search experience for no architectural necessity, since filtering server-side-but-not-Subsplash-side achieves the same "never ship the full roster to the browser" goal.
- **Add a sync/cache layer (KV or DB) now.** Best long-term scalability, but a new Tier-2 dependency this app doesn't need at v1 scale. Deferred to a future ADR if evidence shows it's needed.
