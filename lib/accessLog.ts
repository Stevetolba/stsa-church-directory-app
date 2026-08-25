// Access/audit log (ADR-0016): who signed in (or was denied), and who read
// directory data and when. Same DB/mock dual-path convention as
// lib/attendance.ts — Neon Postgres via Drizzle in production, an in-memory
// globalThis array in dev/test so `npm run dev` needs zero setup.
//
// Logging is best-effort: recordAccessEvent never throws. A logging failure
// must not block the sign-in or directory read it's trying to record — it's
// an audit trail, not a gate.

import { desc, gte } from "drizzle-orm";
import { getDb, isDbConfigured } from "./db";
import { accessEvents, type AccessEventRow } from "./db/schema";
import type { Role } from "@/types/auth";

export type AccessEventType = "sign_in" | "sign_in_denied" | "directory_read";

export interface AccessEvent {
  id: string;
  occurredAt: string; // ISO 8601
  email: string;
  name: string | null;
  role: Role;
  eventType: AccessEventType;
  resource: string | null;
}

function fromRow(row: AccessEventRow): AccessEvent {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    email: row.email,
    name: row.name,
    role: row.role as Role,
    eventType: row.eventType as AccessEventType,
    resource: row.resource,
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __mockAccessEvents: AccessEvent[] | undefined;
}

function mockStore(): AccessEvent[] {
  return (globalThis.__mockAccessEvents ??= []);
}

export interface RecordAccessEventInput {
  email: string;
  name?: string | null;
  role: Role;
  eventType: AccessEventType;
  // What was read — omitted for sign_in/sign_in_denied.
  resource?: string;
}

// Never throws. Swallows and console.errors any failure so an outage in the
// audit log (or a missing DATABASE_URL in a misconfigured deploy) can never
// turn into a broken sign-in or a broken directory page.
export async function recordAccessEvent(input: RecordAccessEventInput): Promise<void> {
  try {
    if (isDbConfigured()) {
      const db = getDb();
      await db.insert(accessEvents).values({
        email: input.email,
        name: input.name ?? null,
        role: input.role,
        eventType: input.eventType,
        resource: input.resource ?? null,
      });
      return;
    }
    mockStore().unshift({
      id: `access-${crypto.randomUUID()}`,
      occurredAt: new Date().toISOString(),
      email: input.email,
      name: input.name ?? null,
      role: input.role,
      eventType: input.eventType,
      resource: input.resource ?? null,
    });
  } catch (err) {
    console.error("Failed to record access event", err);
  }
}

// This isn't a compliance archive — just an at-a-glance "who's been in here"
// for the admin-only Activity Log page — so it's capped to a recent window
// rather than supporting a full historical export/pagination. Rows
// themselves are never deleted (recordAccessEvent only ever inserts), so
// this window governs what listAccessEvents surfaces, not what's retained
// in Postgres.
//
// The window is time-based (at least the last 30 days), not row-count-based
// — a fixed row cap (the previous design) could silently show far less than
// a month once an org's sign-in/directory-read volume grew, even though the
// data was still sitting in the table the whole time. MAX_EVENTS is now
// just a safety ceiling for a pathologically high-traffic window, not the
// primary bound.
const MIN_RETENTION_DAYS = 30;
const MAX_EVENTS = 5000;

export async function listAccessEvents(limit = MAX_EVENTS): Promise<AccessEvent[]> {
  const cappedLimit = Math.max(0, Math.min(limit, MAX_EVENTS));
  const since = new Date(Date.now() - MIN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  if (isDbConfigured()) {
    const db = getDb();
    const rows = await db
      .select()
      .from(accessEvents)
      .where(gte(accessEvents.occurredAt, since))
      .orderBy(desc(accessEvents.occurredAt))
      .limit(cappedLimit);
    return rows.map(fromRow);
  }
  return mockStore()
    .filter((r) => new Date(r.occurredAt) >= since)
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, cappedLimit);
}
