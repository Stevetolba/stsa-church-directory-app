// App-facing event shape, mapped from Subsplash's Event (openapi.yaml → Event,
// /events/v2/events). Attendance is app-owned (ADR-0015); events are read from
// Subsplash and cached like profiles.

// A Subsplash session is a class/room/sub-event with its own check-in
// (openapi.yaml → Session; the vendored schema is a stub, so this shape is
// confirmed against the live API rather than the spec). "General" is the
// implicit session for an event with none.
//
// type confirmed against the live org (three values only): "child" sessions
// (e.g. Sunday School classes) restrict the check-in roster to children,
// "adult" sessions restrict it to non-children, "everyone" applies no
// household_role restriction and drops the campus filter too (lib/events.ts
// consumers — see CheckInPageClient).
export type SessionType = "child" | "adult" | "everyone";

// Confirmed against the live org: a "child" session may carry real matching
// data instead of relying on parsing its name. suggestionType selects which
// field pair (if either) is meaningful — sessions have been observed with a
// stray minGrade populated even when suggestionType is "age" or "none", so
// suggestionType must gate which fields are trusted, not just their
// presence. minGrade/maxGrade share Profile.academic_grade_value's exact
// numbering (lib/grades.ts: Pre-K=1, K=2, 1st=3 … 12th=14) — confirmed
// identical scale, no conversion needed. minAgeMonths/maxAgeMonths are in
// months, not years (confirmed: a "Pre-K-5yrs" session reported 36–71).
export type SessionSuggestionType = "grade" | "age" | "none";

export interface EventSession {
  id: string;
  name: string;
  type: SessionType;
  suggestionType?: SessionSuggestionType;
  minGrade?: number;
  maxGrade?: number;
  minAgeMonths?: number;
  maxAgeMonths?: number;
}

export type EventStatus = "draft" | "scheduled" | "published";
export type EventSource = "standard" | "ical" | "repeating";

export interface AppEvent {
  id: string;
  // Repeating-event id when this occurrence came from a series
  // (_embedded["repeating-event"].id), else the event's own id. The stable
  // key for attendance across a recurring event's occurrences (ADR-0015).
  series_id: string;
  title: string;
  start_at: string; // ISO 8601
  end_at?: string; // ISO 8601
  timezone: string; // IANA, e.g. "America/New_York"
  all_day: boolean;
  // Event-local calendar date of start_at (YYYY-MM-DD), the attendance
  // occurrence key alongside series_id.
  occurrence_date: string;
  source: EventSource;
  status: EventStatus;
  check_in_enabled: boolean;
  sessions: EventSession[];
}
