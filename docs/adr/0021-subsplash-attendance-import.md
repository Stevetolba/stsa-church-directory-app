# ADR-0021: Attendance is captured in Subsplash Check-In and imported, not captured in this app

**Status:** Accepted
**Date:** 2026-08-21

## Context

ADR-0015 built this app's own check-in capture: a web `/kiosk` surface, device-authorized iPad tokens, session/roster/drop-off/pickup logic, printed labels (`components/labels/`, `lib/labelPdf.ts`), and a partially-built native wrapper (`ios/`, uncommitted). In practice, the church runs **Subsplash Check-In** at the door for Liturgy and Sunday School — so attendance was being captured twice, once in Subsplash (the one volunteers actually use) and once here (unused).

Subsplash has no API for per-person check-in data: the vendored `openapi.yaml` has no check-in/attendance REST path, `AttendanceRes` is a schema stub with no operations, and the full webhook event list (`donation.create`, `profile.create/update/delete`, `end_user_login_event.create`, `response.create`) has nothing attendance-related. The only place per-person check-in data exists outside Subsplash's own UI is the **Check-In dashboard's own attendee export** (Events → Check-In → an occurrence → Total Attendance → Export) — an authenticated web-app surface, not a documented or versioned API.

## Decision

Retire this app's check-in capture entirely. Subsplash Check-In becomes the sole system of record for *who checked in*; this app's role narrows to reporting and follow-up (occurrence attendance, series frequency, absentees, email-parents) over attendance **imported** from Subsplash on a schedule.

- **`lib/subsplashExportCsv.ts`** parses a Subsplash Check-In attendee export — confirmed byte-for-byte against two real exports pulled from the live dashboard (a single-occurrence detail export and a full-year "All Check-ins" range export), which turn out to differ in header casing ("First Name" vs "First name") and date/time column shape (full datetimes vs. a bare date + bare time meant to be combined). Both are handled uniformly; an unrecognized row is dropped into a `skipped` list with a reason, never guessed at.
- **Two scripts POST the parsed result to `POST /api/attendance/import`, one occurrence at a time** so a bad occurrence doesn't sink the rest of a run:
  - `scripts/sync-subsplash-attendance.ts` — manual: point it at a CSV you exported by hand.
  - `scripts/scheduled-sync-subsplash.ts` — automated: opens `dashboard.subsplash.com` using a previously-captured, already-authenticated session (see Consequences — neither a fresh login nor a *saved* session works from a cloud runner) and, for every check-in-enabled series, opens that series' Check-In report at `https://dashboard.subsplash.com/-d/#/library/repeating-events/{seriesId}/check-in-report?minDate=...` (`{seriesId}` is exactly the Subsplash repeating-event id `lib/events.ts`'s `listSeries()` already exposes) and clicks Export. The button doesn't call a distinct API at click time — it assembles a ZIP client-side from data the page already loaded and triggers a real browser download of it, so Playwright's native `download` event captures it; there was no stable request to reverse-engineer instead. Run daily via `scripts/run-scheduled-sync-local.sh`, a **local `launchd` job on the church's own machine** (not GitHub Actions — see Consequences for why cloud automation doesn't work here) with a 14-day lookback, so a missed or failed run self-heals on the next one at zero cost.
    - **`listSeries()` can't be called in-process from the script.** It's discovered live: the script hit `Error: Invariant: incrementalCache missing` on the first real CI run, because `lib/events.ts` caches through Next.js's `unstable_cache`, which only works inside a running Next.js server — not a standalone `tsx` process. Fixed by adding `GET /api/attendance/series` (same bearer-token-or-admin-session auth as the import route, factored into `lib/attendanceImportAuth.ts`) so the script discovers series over HTTP, the same way it already POSTs occurrences — never importing server-only Next.js library code directly. A useful lesson for any future script in this repo: treat the deployed app as a remote service to call, not a library of business logic to import.
  - Both funnel through `scripts/lib/importClient.ts` so the POST/report logic exists once. Re-running either (the same file, or an overlapping date range) is a no-op beyond updating rows to match the export's current state — the unique `(series_id, occurrence_date, profile_id)` constraint from ADR-0015 makes re-import idempotent by construction, not just "probably fine" (a synthetic guest id is derived deterministically from the occurrence + attendee name for exactly this reason — see below).
- **Imported rows land in the existing `check_ins` table**, not a parallel store — `method: "subsplash"`. Every downstream consumer (`/api/attendance/report`, `/absentees`, `/email`, `summarizeSeriesFrequency`) keeps working unmodified; only presentation changed (a "Subsplash" source badge in place of a check-in operator, since imports carry no such actor — but real check-in/check-out timestamps and the drop-off adult's name *are* in the export and preserved).
- **Name/email resolution is best-effort, and failure is visible, not silent.** `lib/attendanceImport.ts` matches an exported attendee to a directory profile by, in order: Subsplash profile id (if the source ever provides one) → a full name unique across the directory → if the name is ambiguous, narrow to the candidate whose email also matches. Email is deliberately **not** a primary, name-independent match key: confirmed against a real export, a child's "[Checked in] Email" column is frequently the *guardian's* email (Subsplash pre-fills it from the household's contact), not the child's own — matching on email alone would silently attribute a child's attendance to their parent's profile instead. An unresolved attendee is still recorded — as a guest row keyed by a deterministic id derived from the occurrence date + their normalized name (not a random id, so re-importing updates the same row instead of duplicating it) — and logged to the new `attendance_imports` table, which the report UI surfaces as a named warning: an admin can see exactly who didn't match and go fix the mismatch (typo, name change, not yet in the directory) instead of that person quietly reading as "absent" every week.
- **`app/api/attendance/import`** accepts either the sync job's bearer token (`ATTENDANCE_IMPORT_TOKEN`, timing-safe compared) or an admin's own session — so a payload can also be replayed by hand while debugging, without minting a token for a person.
- **Everything specific to in-app capture is deleted**, not just disabled: `/kiosk`, `/api/kiosk/*`, `/api/devices/*`, `/api/attendance/reprint`, the `devices` table, `lib/deviceAuth.ts`, `lib/labelPdf.ts`/`labelStock.ts`, `lib/matchCode.ts`, `components/labels/`, and the check-in POST/PATCH/DELETE handlers on `/api/attendance` (GET — reading who's checked in — survives, now reading imported rows). The uncommitted `ios/`/`android/` native wrappers are dropped along with it. `check_ins` columns that only ever served capture (`droppedOffBy*`, `matchCode`, `checkedOutAt/By`) are kept (nullable, harmless) rather than dropped, since dropping a column is irreversible and buys nothing here.

## Consequences

- **Both the export format and the dashboard UI it's scraped from are undocumented and unversioned.** Subsplash can change either in any release with no notice — the two export types already confirmed to differ from each other (header casing, date/time column shape) is a preview of that risk, not a one-time surprise. `lib/subsplashExportCsv.ts` fails loudly (a row lands in `skipped`) rather than guessing at an unrecognized shape; `scheduled-sync-subsplash.ts` fails one series at a time rather than silently. The 14-day lookback exists precisely so a broken run means "attendance goes stale for a few days," not "attendance is lost."
- **Cloud CI automation (GitHub Actions) was tried first and abandoned — confirmed not to work, not just anticipated as fragile.** In order:
  1. A fresh username/password login from a GitHub Actions runner is silently rejected: the form fills and submits correctly with human-confirmed valid credentials, yet bounces back to the same plain login page — no error text, no 2FA/OTP screen shown either. Most consistent explanation: Subsplash flags the runner's IP/device and rejects the attempt outright.
  2. The obvious fix — authenticate interactively once, replay the session instead of the password — *also* failed from CI, for a different reason: a session captured via Playwright's `storageState()` (cookies + localStorage) and replayed from a GitHub runner was rejected too, even though it was genuinely valid moments earlier. Device/IP trust appears to be checked continuously, not just at login.
  3. Testing *locally*, on the same machine and network the session was captured on, ruled out IP/network as the (sole) cause: the same `storageState()`-based session was rejected there too. Inspecting the captured file directly explained why — it contained only Google Analytics and reCAPTCHA cookies, **no real Subsplash auth data at all**, despite the browser visibly showing the signed-in dashboard at capture time. `storageState()` only captures cookies and localStorage; Subsplash's actual session apparently lives elsewhere (IndexedDB is the common place modern auth libraries put it), which `storageState()` silently omits. This alone was enough to explain every session-based CI failure without needing IP/device trust as an explanation at all — though (1) stands on its own regardless.
  - **Fix: a local `launchd` job, and a persistent Chrome profile instead of a `storageState()` snapshot.** `scripts/capture-subsplash-session.ts` now uses `chromium.launchPersistentContext()` against a fixed local directory (`scripts/.subsplash-profile/`, gitignored) instead of capturing and serializing state — a human signs in there once, completing whatever verification Subsplash shows them, and the profile directory *is* the saved session from then on (nothing to export, serialize, or copy into a secret). `scripts/scheduled-sync-subsplash.ts` opens that same directory to run. `scripts/run-scheduled-sync-local.sh` + a `launchd` `.plist` (`~/Library/LaunchAgents/church.stsa.attendance-sync.plist`) runs it daily on the church's own machine, on the church's own network — sidestepping both the cloud-IP rejection (1) and, since a real Chrome profile carries everything a session needs by construction, the storageState gap (3) as well. The `.github/workflows/attendance-sync.yml` GitHub Actions workflow was deleted rather than kept around non-functional.
  - This trades zero-maintenance cloud automation for one recurring manual step (re-running the capture script whenever the session expires — frequency unknown until observed in practice) plus a dependency on the sync machine being on and network-connected at the scheduled time. Both are absorbed by the same 14-day-lookback idempotency the design already leans on for CI-outage resilience; an occasionally-skipped local run is not a new failure mode, just a more frequent instance of an already-designed-for one. If this stops being worth it, the fallback is the fully manual `scripts/sync-subsplash-attendance.ts` (hand-exported CSV) from Phase 1.
  - **Two more real bugs surfaced once authentication itself was solved**, both in how `fetchCheckInExportCsv` navigates between series once a session is open:
    1. A fresh `page.goto()` straight to each series' full check-in-report URL — the equivalent of pasting the URL into a new tab — bounces through `/auth/logout?redirect=...` and never returns, 100% reproducibly, on all 34 real series tested. The dashboard is an Ember app (hash-routed); a real person is always already sitting on a booted instance of it and clicks through to a report, i.e. a same-document hash change, never a fresh top-level load into a protected deep link. Fixed by setting `location.hash` via `page.evaluate()` instead, reproducing an in-app click rather than a cold boot.
    2. That fix then made the `evaluate()` call itself throw `Execution context was destroyed, most likely because of a navigation` on every series — Ember's own route transition tears down/rebuilds enough of the page that Playwright reports the *assigning call's own* context as gone, even though the transition itself is legitimate. A known false-alarm shape for an app-triggered transition, not evidence it failed; that one specific error is now swallowed, and `openSubsplashDashboard`'s initial load switched from `domcontentloaded` to `networkidle` to let Ember fully boot before the loop starts.
  - The lesson generalizes: this class of scraper should navigate through the SPA the way a browser tab that's already open does, not the way a freshly-typed URL does — the two are not equivalent even with an identical, valid session — and even the "correct" in-app navigation technique needs to tolerate the framework's own transition mechanics looking like an error from the outside.
- **Imported attendance carries no check-in operator identity** — Subsplash's export doesn't say who ran the kiosk, only who checked a person in and (often) who dropped them off. Reports that used to show "checked in at 9:04 by office@…" now show a "Subsplash" badge for an imported row's operator instead; real check-in/check-out timestamps and the drop-off adult's name *are* preserved from the export.
- Worth raising with the Subsplash CSM in parallel: whether automated dashboard access is permitted under their terms, and whether per-person check-in data is on their API roadmap. An official endpoint would let the whole scraper be deleted in favor of a plain authenticated request.

## Local automation setup

One-time, on the machine that will run the daily sync:

```bash
cp scripts/.sync-local.env.example scripts/.sync-local.env   # fill in APP_BASE_URL / ATTENDANCE_IMPORT_TOKEN
nvm use 24 && npm run sync:subsplash:capture-session          # sign in yourself when the browser opens
```

Then install the `launchd` job (`~/Library/LaunchAgents/church.stsa.attendance-sync.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>church.stsa.attendance-sync</string>
	<key>ProgramArguments</key>
	<array>
		<string>/Users/tolbas/stsa-church-directory-web/scripts/run-scheduled-sync-local.sh</string>
	</array>
	<key>StartCalendarInterval</key>
	<dict>
		<key>Hour</key>
		<integer>6</integer>
		<key>Minute</key>
		<integer>0</integer>
	</dict>
	<key>StandardOutPath</key>
	<string>/Users/tolbas/stsa-church-directory-web/scripts/.sync-local.log</string>
	<key>StandardErrorPath</key>
	<string>/Users/tolbas/stsa-church-directory-web/scripts/.sync-local.log</string>
	<key>RunAtLoad</key>
	<false/>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/church.stsa.attendance-sync.plist    # registers the schedule
launchctl unload ~/Library/LaunchAgents/church.stsa.attendance-sync.plist  # to pause/remove it
launchctl start church.stsa.attendance-sync                                # to run it right now, for testing
```

The Mac needs to be on, awake, and network-connected at the scheduled hour — `launchd` does not wake a sleeping machine. A missed day is absorbed by the 14-day lookback the same way a missed cloud run would have been. Adjust `Hour`/`Minute` to a time this machine is reliably available; edit and re-`load` the plist to change it.

## Alternatives rejected

- **Finish the native check-in app.** Solves a problem the church doesn't have — Subsplash Check-In is already the capture tool volunteers use at the door. Building a second one only to import from it later would be strictly more work for the same end state.
- **Subsplash webhooks.** No check-in event exists in the webhook event list; nothing to subscribe to.
- **Ask Subsplash for API access to check-in data.** Worth pursuing (see Consequences), but not something this app can wait on — it isn't available today.
- **Attendance *totals* export instead of per-person.** Subsplash's documented "export attendance totals" feature is aggregate-only. It would kill absentee tracking, series frequency by person, and email-parents — the reporting features this app exists to provide.
