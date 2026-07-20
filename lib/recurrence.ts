// Pure recurrence expansion for Subsplash RepeatingEvents (ADR-0015 addendum).
// Subsplash stops materializing/exposing individual occurrence Events via
// /events/v2/events once a repeating series' visibility is "dashboard"
// (Unlisted) — confirmed against the live org: a series' own check_in_enabled
// and repetition_rules stay visible via /events/v2/repeating-events even when
// none of its occurrences show up in the events list. So for series with
// check-in enabled, occurrences are computed here from the RRULE rather than
// relying on Subsplash to have exposed them, and merged with whatever real
// occurrence Events *are* available (lib/events.ts) — real data wins when
// both exist for the same (series_id, occurrence_date).
import { rrulestr } from "rrule";
import { zonedWallTimeToUtc } from "./eventTime";

export interface RepeatingEventSeriesMeta {
  id: string;
  timezone: string;
  eventDurationMinutes: number;
  // Raw RFC5545 lines from RepeatingEvent.repetition_rules, e.g.
  // ["DTSTART;TZID=America/New_York:20251026T113000", "RRULE:FREQ=WEEKLY;BYDAY=SU", "EXDATE;TZID=America/New_York:20260412T113000"]
  repetitionRules: string[];
}

export interface ExpandedOccurrence {
  start_at: string; // ISO instant
  end_at: string; // ISO instant
}

// rrule has no real IANA timezone/DST support, so TZID is stripped from every
// line before parsing — rrule then reads the literal digits as UTC. Each
// generated occurrence's Y/M/D/H/M/S is re-interpreted in the series' real
// timezone via zonedWallTimeToUtc afterward. Stripping TZID identically from
// DTSTART/RRULE/EXDATE keeps EXDATE exclusion matching correctly, since
// rrule compares generated occurrences against EXDATE by exact value.
const TZID_PREFIX = /;TZID=[^:]+:/;

export function expandRepeatingEvent(
  series: RepeatingEventSeriesMeta,
  from: Date,
  to: Date
): ExpandedOccurrence[] {
  if (series.repetitionRules.length === 0) return [];
  const text = series.repetitionRules.map((line) => line.replace(TZID_PREFIX, ":")).join("\n");

  let rule;
  try {
    rule = rrulestr(text);
  } catch {
    return [];
  }

  // from/to are real instants; rrule's internal clock is "literal digits as
  // UTC" (per the TZID-stripping above), so widen the window by a day on
  // each side rather than trying to convert from/to into that space exactly
  // — a day of slop only affects how many rows get generated, not what's
  // ultimately shown (every generated occurrence still gets its own correct
  // instant below).
  const widenedFrom = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  const widenedTo = new Date(to.getTime() + 24 * 60 * 60 * 1000);

  return rule.between(widenedFrom, widenedTo, true).map((occ) => {
    const startUtc = zonedWallTimeToUtc(
      occ.getUTCFullYear(),
      occ.getUTCMonth() + 1,
      occ.getUTCDate(),
      occ.getUTCHours(),
      occ.getUTCMinutes(),
      occ.getUTCSeconds(),
      series.timezone
    );
    const endUtc = new Date(startUtc.getTime() + series.eventDurationMinutes * 60 * 1000);
    return { start_at: startUtc.toISOString(), end_at: endUtc.toISOString() };
  });
}
