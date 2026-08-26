// Thin REST wrapper around the Google Calendar API v3 Events resource
// (ADR-0022) — same spirit as lib/subsplash.ts's subsplashFetch: raw fetch,
// no SDK. GOOGLE_CALENDAR_USE_MOCK (default true, mirrors SUBSPLASH_USE_MOCK
// in lib/subsplash.ts) fakes every call against an in-memory store, so the
// sync button, API route, and DB logging can all be exercised without real
// Google credentials.

import { getGoogleCalendarServiceToken } from "./googleCalendarAuth";

const USE_MOCK = process.env.GOOGLE_CALENDAR_USE_MOCK !== "false";
const API_BASE = "https://www.googleapis.com/calendar/v3";

// Tags every event this feature creates, in extendedProperties.private — the
// safety scope the pruning step queries against, so it can never see (and
// therefore never delete) an event a human added to the calendar by hand.
export const SYNC_SOURCE_TAG = "subsplash-sync";

export interface GoogleCalendarEventTime {
  dateTime: string; // ISO 8601 / RFC3339
  timeZone: string; // IANA, e.g. "America/New_York"
}

export interface GoogleCalendarEventInput {
  googleEventId: string; // deterministic — see googleEventIdFor in lib/calendarSync.ts
  subsplashId: string; // tagged onto extendedProperties.private for pruning/traceability
  summary: string;
  description?: string;
  start: GoogleCalendarEventTime;
  end: GoogleCalendarEventTime;
  // RFC5545 RRULE/EXDATE lines only — no DTSTART (Google derives that from
  // `start` above). Omitted entirely for a one-off (non-repeating) event.
  recurrence?: string[];
}

function calendarId(): string {
  const id = process.env.GOOGLE_CALENDAR_ID;
  if (!id) throw new Error("Missing GOOGLE_CALENDAR_ID");
  return id;
}

function eventBody(input: GoogleCalendarEventInput) {
  return {
    id: input.googleEventId,
    summary: input.summary,
    description: input.description,
    start: input.start,
    end: input.end,
    recurrence: input.recurrence,
    extendedProperties: { private: { source: SYNC_SOURCE_TAG, subsplashId: input.subsplashId } },
  };
}

// --- Mock store (dev/test) — mirrors lib/attendance.ts's globalThis mock
// pattern so a sync can be run repeatedly in dev and behave idempotently
// (create the first time, update after) without any real Google call. ---
declare global {
  // eslint-disable-next-line no-var
  var __mockCalendarEvents: Map<string, { subsplashId: string }> | undefined;
}
function mockStore(): Map<string, { subsplashId: string }> {
  return (globalThis.__mockCalendarEvents ??= new Map());
}

async function googleFetch<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T | null }> {
  const token = await getGoogleCalendarServiceToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : null;
  return { status: res.status, data };
}

// Google's error responses shape as {"error": {"code", "message", "errors":
// [...]}} — pulling the message out is the difference between a bare "400"
// (which was all upsertCalendarEvent's own thrown errors carried before
// this) and knowing whether it's e.g. an invalid RRULE, a bad time value,
// or something else entirely.
function errorDetail(data: unknown): string {
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return JSON.stringify(data);
}

// Creates the event with its (caller-supplied, deterministic) id if it
// doesn't exist yet, else updates it in place — idempotent, with no
// separate id-mapping table needed. Same deterministic-id-for-idempotency
// idea as stableGuestId in lib/attendanceImport.ts.
export async function upsertCalendarEvent(input: GoogleCalendarEventInput): Promise<"created" | "updated"> {
  if (USE_MOCK) {
    const existed = mockStore().has(input.googleEventId);
    mockStore().set(input.googleEventId, { subsplashId: input.subsplashId });
    return existed ? "updated" : "created";
  }

  const body = JSON.stringify(eventBody(input));
  const id = encodeURIComponent(input.googleEventId);
  const { status, data } = await googleFetch(`/calendars/${encodeURIComponent(calendarId())}/events/${id}`, {
    method: "PUT",
    body,
  });
  if (status === 404) {
    const insertRes = await googleFetch(`/calendars/${encodeURIComponent(calendarId())}/events`, {
      method: "POST",
      body,
    });
    if (insertRes.status >= 300) {
      throw new Error(
        `Failed to create calendar event ${input.googleEventId} (${input.summary}): ${insertRes.status} ${errorDetail(insertRes.data)}`
      );
    }
    return "created";
  }
  if (status >= 300) {
    throw new Error(
      `Failed to update calendar event ${input.googleEventId} (${input.summary}): ${status} ${errorDetail(data)}`
    );
  }
  return "updated";
}

// Every Google event id this sync has previously created, for the pruning
// diff in lib/calendarSync.ts — scoped via the extendedProperties.private
// tag above.
export async function listSyncedCalendarEventIds(): Promise<Set<string>> {
  if (USE_MOCK) return new Set(mockStore().keys());

  const ids = new Set<string>();
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      privateExtendedProperty: `source=${SYNC_SOURCE_TAG}`,
      maxResults: "250",
      showDeleted: "false",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const { data } = await googleFetch<{ items?: { id: string }[]; nextPageToken?: string }>(
      `/calendars/${encodeURIComponent(calendarId())}/events?${params.toString()}`
    );
    (data?.items ?? []).forEach((e) => ids.add(e.id));
    pageToken = data?.nextPageToken;
  } while (pageToken);
  return ids;
}

export async function deleteCalendarEvent(googleEventId: string): Promise<void> {
  if (USE_MOCK) {
    mockStore().delete(googleEventId);
    return;
  }
  const id = encodeURIComponent(googleEventId);
  const { status, data } = await googleFetch(`/calendars/${encodeURIComponent(calendarId())}/events/${id}`, {
    method: "DELETE",
  });
  // 404/410 = already gone — deleting an already-deleted event is a no-op,
  // not a failure.
  if (status >= 300 && status !== 404 && status !== 410) {
    throw new Error(`Failed to delete calendar event ${googleEventId}: ${status} ${errorDetail(data)}`);
  }
}
