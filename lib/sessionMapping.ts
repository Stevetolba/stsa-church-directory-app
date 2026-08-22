// A session-type helper retained after ADR-0021 retired in-app check-in
// (which used to own this file for roster session auto-selection). Reports
// still need to know whether an event's sessions are uniformly "child",
// "adult", or "everyone" — e.g. to default the Absentees tab's
// children-only filter for a kids' class vs. a whole-family service.

import type { EventSession, SessionType } from "@/types/event";

// The session type shared by every session on an event, or null when they
// disagree (a single session trivially agrees with itself).
export function eventAutoSessionType(sessions: EventSession[]): SessionType | null {
  const types = Array.from(new Set(sessions.map((s) => s.type)));
  return types.length === 1 ? types[0] : null;
}
