# ADR-0028: Weekly Sunday School attendance email to Team Leads

**Status:** Accepted
**Date:** 2026-11-04

## Context
Team Leads can open the Series tab on the report page but nobody was told when new attendance landed. They want to know who came last Sunday and how many Sundays this month each child has come.

## Decision
- **One email per campus** (Arlington, Leesburg) for the pinned Sunday School series (`SUNDAY_SCHOOL_SERIES_BY_CAMPUS`), sent individually to every profile with `DirectoryRole = Team Lead` and that campus. Team Lead profiles don't record which class they lead, so each email has one section per Suggested Filter band (`lib/sundaySchoolGroups.ts`, shared with the report page) plus an "All Sunday School" section.
- **Content:** children who attended at least once this month, with grade, "N/M Sundays this month" and a ● per Sunday, last Sunday highlighted and listed first. Attendees only: no absentee list.
- **Schedule:** attendance is imported by hand (ADR-0021), so Wednesday noon is the earliest send. Vercel Cron hits `/api/cron/attendance-report` once a day, Wed–Sat at 17:00 UTC (Hobby plan allows only daily crons), i.e. 12:00 EST / 13:00 EDT; the job also guards on Wednesday 12:00 America/New_York, and sends a campus as soon as last Sunday has check-ins, retrying daily until Saturday.
- **Send once:** `attendance_report_sends` has a unique `(campus, sunday_date)`; the slot is claimed before sending and released on failure so the next run retries.

## Consequences
- No unsubscribe link; recipients are managed through DirectoryRole/Campus in Subsplash.
- Children's names go to Team Leads, who can already view this report (ADR-0017).
- If an import never happens, nothing is sent; the cron response says "waiting for import".
- A campus with no Team Leads, or no class that Sunday, is skipped.
