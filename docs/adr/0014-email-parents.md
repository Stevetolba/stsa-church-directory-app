# ADR-0014: Email parents from the Children page, and people from the People page

**Status:** Accepted
**Date:** 2026-07-15

## Context

Staff and volunteers running a ministry group (e.g. "Arlington Middle School") want to email that group's parents directly from the Children page instead of exporting a CSV and BCC-ing everyone by hand. Nothing in the codebase sent email before this — no provider integration, no rich text editor, no compose UI. The same need showed up on the People page shortly after (e.g. emailing every Member at a campus) and was added as a parallel feature, staff/admin only from the start.

## Decision

### Recipients: the currently-filtered set, resolved server-side

"Email Parents" targets whichever children the page's existing filters (search/status/campus/grade/family scope) currently match — the same set the CSV export already targets, and gated the same way (`hasActiveFilter`, both client-side on the button and re-checked server-side in the route) so a bare/empty filter can't blast the entire directory. The compose dialog never lets a user pick individual addresses; it reuses `attachParentContacts` (ADR-0013) to resolve up to two parent/guardian emails per child and dedupes across households, then `POST /api/children/email` recomputes that same resolution from the submitted filters rather than trusting a client-supplied recipient list.

### Access: staff/admin only (revised)

Originally scoped open to any authenticated role (volunteers included), matching `GET /api/children` — volunteers can already see a child's parents by opening the household (ADR-0011's `profileVisibleToVolunteer`), so a send wouldn't expose new *data*. Revised to `requireStaffOrAdmin`-gated for now: a send is an outbound action with real consequences (attachments, tone, reply-to routing) beyond a read, and it's simpler to open it up later than to walk it back after volunteers have used it. `ChildrenPageClient` hides the "Email Parents" button entirely for volunteers (`canEmailParents`, resolved server-side from `session.user.role` in `page.tsx`); the route's `requireStaffOrAdmin` call is the actual enforcement (ADR-0005 — hiding UI is not a guard).

`POST /api/profiles/email` (People) is `requireStaffOrAdmin`-gated the same way, but needed no separate UI-hiding flag: the whole People page is already unreachable for volunteers (middleware's `VOLUNTEER_BLOCKED_PATHS`, ADR-0011), matching `GET /api/profiles`'s existing boundary — the Email People button just inherits that.

### Privacy: BCC, sender identity via Reply-To

Sends go through Resend (`lib/email.ts`) with all real recipients in `bcc` (max 50 per Resend call — larger sends batch into multiple calls) so no parent's address is exposed to another. The `From` address is a fixed, domain-verified `EMAIL_FROM_ADDRESS`; the signed-in user's name becomes the display name and their email becomes `Reply-To`, so replies land with the sender, not a shared inbox, without needing them to have their own verified sending domain.

`EMAIL_FROM_ADDRESS` is also always the `to` recipient on every send — Resend requires a non-empty `to`, and pointing it at the from address doubles that requirement as an always-on copy: a record of what went out lands in that inbox without ever being exposed to parents. A multi-batch send (>50 recipients) lands one copy per batch rather than a single merged copy.

### Dev-safe by default

`lib/email.ts` mirrors `SUBSPLASH_USE_MOCK`'s approach: when `RESEND_API_KEY` is unset (local dev, CI), sends are logged to the console instead of actually going out. No mock-mode flag needed — the absence of a real key is itself the signal.

### New UI primitives

Two things didn't exist yet and were added minimally rather than adopted wholesale from a design system: `components/ui/dialog.tsx` (Base UI's `@base-ui/react/dialog`, styled to match `popover.tsx`'s existing conventions) for the compose modal, and `components/RichTextEditor.tsx` (TipTap `StarterKit` + `Link` + `Placeholder`) for the message body — plain `<textarea>` wasn't enough for a message parents will read as a formatted email.

### Current-user plumbing

`ChildrenPageClient`/`PeoplePageClient` need the signed-in user's name/email to show "From" and set Reply-To server-side (Children additionally needs `role`, to decide whether to render the button at all). The app has no `useSession()` anywhere (deliberately — session is resolved once server-side and passed down as props, per `app/(dashboard)/layout.tsx`'s existing pattern for `Sidebar`). Both `app/(dashboard)/children/page.tsx` and `app/(dashboard)/people/page.tsx` are now thin server components that call `auth()` and pass `user` (+ `canEmailParents` for Children) into the client component doing the actual page work.

### Attachments

The compose dialogs can attach files: read client-side via `FileReader` into base64, submitted as `{ filename, content }` pairs alongside the JSON body (no multipart upload plumbing needed). `lib/validation/email.ts` caps this at `MAX_ATTACHMENTS_COUNT` (10 files) and `MAX_ATTACHMENTS_TOTAL_BYTES` (10MB combined, checked both client-side before reading files and server-side via a schema `refine`) — well under Resend's 40MB-per-email hard cap, since a multi-batch send (>50 recipients) re-sends the same attachments with every batch. Attachments are shown read-only in the review step alongside subject/body.

### `EmailParentsDialog` vs `EmailPeopleDialog`: parallel, not shared

`components/EmailPeopleDialog.tsx` is a near-duplicate of `components/EmailParentsDialog.tsx` (same compose → review → send flow, same attachment handling) rather than a shared generic component. The two differ in: recipient source (`GET /api/profiles` + each profile's own `email`, vs `GET /api/children?includeParents=true` + `attachParentContacts`' `parent1`/`parent2`), send endpoint (`/api/profiles/email` vs `/api/children/email`), and filter shape (People has no `memberType`). This mirrors how the rest of the People/Children surface is already built — `page.tsx`, `usePeople`/`useChildren`, `/api/profiles`/`/api/children`, `PROFILE_EXPORT_COLUMNS`/`CHILD_EXPORT_COLUMNS` are all separately maintained pairs, not unified behind one generic list component. Consistent with that existing pattern rather than introducing the first shared abstraction across the two surfaces.

## Consequences

- A new third-party dependency (Resend) and its `RESEND_API_KEY`/`EMAIL_FROM_ADDRESS` env vars — production values live in Vercel, not CI, same as the Subsplash/Auth.js secrets.
- The sending domain behind `EMAIL_FROM_ADDRESS` must be verified with Resend before real sends work; until then (or in any environment without a key), sends no-op to the console.
- No delivery/open tracking, retry queue, or send history is implemented — a failed batch surfaces as a toast error to the sender, with no record kept of who was emailed when. Acceptable for the initial version; worth revisiting if this becomes a heavily used feature.
- Volunteers lose access to a capability they briefly had; if that's wanted back, it's a one-line change (`requireStaffOrAdmin` → session-only) plus removing the `canEmailParents` gate in `page.tsx`.
- A large attachment (near the 10MB cap) inflates the JSON POST body by ~33% (base64 overhead) and gets held in memory client- and server-side for the duration of the request — acceptable at church-newsletter scale, not designed for bulk binary transfer.
- `EmailParentsDialog` and `EmailPeopleDialog` will drift if one gets a UI change the other doesn't (e.g. a future toolbar addition to the rich text editor is shared via `RichTextEditor`, but dialog-level changes like the review-step layout are not). Acceptable given how the rest of this codebase already accepts that tradeoff between the two surfaces; revisit if a third "email X" surface shows up.
