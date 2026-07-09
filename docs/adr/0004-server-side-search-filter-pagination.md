# ADR-0004: Server-side search, filter & pagination

**Status:** Accepted
**Date:** 2026-07-09

## Context

The Subsplash profiles endpoint exposes rich JSON:API query params: `filter[first_name]`, `filter[last_name]`, `filter[status]`, `filter[email]`, `filter[phone]`, plus `sort`, `fields[...]`, and `page`. The original spec's "fetch everything, then filter client-side" approach is fine for a handful of records but breaks down as the directory grows.

## Decision

Push all search, filtering, sorting, and pagination to the Subsplash API. The member-list route handler forwards query params through to Subsplash and returns one page at a time. Debounce search input 300ms client-side before it triggers a request.

The `useMembers` hook takes `{ search, status, campus, page }` and builds the outgoing query string. Sparse fieldsets (`fields[profiles]=...`) are used on the list view to fetch only what the card displays.

## Consequences

- Faster first paint, no giant client-side arrays to filter through.
- Works the same whether the church has 5 members or 50,000.
- The `status`/`campus` values used in the UI (mockup-driven — see [types/profile.ts](../../types/profile.ts)) will need a mapping layer once real Subsplash data is wired up, since `campus` lives in Subsplash `custom_fields` rather than a native filterable field. That mapping is scoped to the Subsplash client (`lib/subsplash.ts`), not to route handlers or UI.

## Alternatives rejected

- **Fetch-then-filter client-side** (original spec). Simple to build but doesn't scale past a small dataset and defeats the purpose of the API's filter/pagination support.
