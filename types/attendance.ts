// App-level attendance record — mirrors the check_ins DB row (lib/db/schema.ts)
// but with camelCase fields and ISO-string timestamps, so it is safe to send
// to the client and to store in the mock (globalThis) implementation. See
// ADR-0015.

export type CheckInMethod = "live" | "backfill" | "kiosk";

export interface CheckInRecord {
  id: string;
  seriesId: string;
  eventId: string;
  occurrenceDate: string; // YYYY-MM-DD (event-local)
  profileId: string; // Subsplash profile id, or "guest:<uuid>"
  displayName: string;
  isChild: boolean;
  sessionId?: string | null;
  sessionName?: string | null;
  checkedInAt: string; // ISO 8601
  checkedInBy: string; // user email or "device:<id>" -- who operated the screen
  // For a child, the adult household member who dropped them off (distinct
  // from checkedInBy). Null for an adult/guest checking themselves in.
  droppedOffByProfileId?: string | null;
  droppedOffByName?: string | null;
  checkedOutAt?: string | null; // ISO 8601, null = still present
  checkedOutBy?: string | null;
  method: CheckInMethod;
  isGuest: boolean;
}

export interface AttendanceSummary {
  total: number;
  present: number; // checked in and not yet checked out
  children: number;
  adults: number;
  guests: number;
  bySession: Array<{ sessionId: string | null; sessionName: string; count: number }>;
}
