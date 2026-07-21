// Drizzle schema for the app-owned attendance store (ADR-0015). Subsplash's
// Events API exposes only a `check_in_enabled` toggle and a read-only
// `has_check_ins` flag — there is no endpoint to read or write per-person
// check-ins — so attendance lives here, keyed to Subsplash profile/event ids.
//
// People are NOT duplicated: a check-in stores only the Subsplash profile_id
// plus a display-name snapshot (so reports still render if a profile is later
// merged/archived) and an is_child flag (fast child counts without re-joining
// the directory).

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  unique,
} from "drizzle-orm/pg-core";

export const checkIns = pgTable(
  "check_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Repeating-event id when the occurrence came from a Subsplash series,
    // else the one-off event's own id. Keying attendance on
    // (series_id, occurrence_date) makes "the last N Sundays" a simple
    // GROUP BY and survives Subsplash re-materializing an occurrence under a
    // new event id.
    seriesId: text("series_id").notNull(),
    // The concrete Subsplash event id for this specific occurrence.
    eventId: text("event_id").notNull(),
    // Event-local calendar date (derived from start_at + the event timezone).
    occurrenceDate: date("occurrence_date").notNull(),
    // Subsplash profile id, or a synthetic `guest:<uuid>` for a walk-in not in
    // the directory (stays NOT NULL, never collides).
    profileId: text("profile_id").notNull(),
    displayName: text("display_name").notNull(),
    isChild: boolean("is_child").notNull().default(false),
    // Subsplash session (class/room). Null when the event has no sessions.
    sessionId: text("session_id"),
    sessionName: text("session_name"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
    // User email, or `device:<device_id>` for a kiosk device actor — who
    // *operated* the check-in, not who brought the child (see below).
    checkedInBy: text("checked_in_by").notNull(),
    // For a child, the adult household member who dropped them off — distinct
    // from checked_in_by, which is the staff/volunteer running the screen.
    // Lets a classroom teacher match drop-off against pickup. Null for an
    // adult/guest checking themselves in, or when no adult was on the roster
    // to pick from.
    droppedOffByProfileId: text("dropped_off_by_profile_id"),
    droppedOffByName: text("dropped_off_by_name"),
    // Short code printed on the child's label and a matching tag for the
    // adult who dropped them off, so pickup can be verified at a glance.
    // Shared across siblings checked in in the same batch. Null for an
    // adult/guest check-in or an "everyone"-type session (kids stay with
    // their parents there, same rule as droppedOffBy*).
    matchCode: text("match_code"),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    checkedOutBy: text("checked_out_by"),
    method: text("method").notNull().default("live"), // 'live' | 'backfill' | 'kiosk'
    isGuest: boolean("is_guest").notNull().default(false),
  },
  (t) => ({
    // Doubles as double-tap protection: one check-in per person per occurrence.
    uniquePerOccurrence: unique("check_ins_unique").on(
      t.seriesId,
      t.occurrenceDate,
      t.profileId
    ),
    seriesOccurrenceIdx: index("check_ins_series_occurrence_idx").on(
      t.seriesId,
      t.occurrenceDate
    ),
    profileIdx: index("check_ins_profile_idx").on(t.profileId),
    methodCheck: check("check_ins_method_check", sql`${t.method} in ('live','backfill','kiosk')`),
    checkoutOrderCheck: check(
      "check_ins_checkout_order_check",
      sql`${t.checkedOutAt} is null or ${t.checkedOutAt} >= ${t.checkedInAt}`
    ),
  })
);

// Kiosk devices authorized via a one-time setup code, so an iPad at the door
// can run check-in/out without a user signing in (ADR-0015). The device token
// is stored only as a sha256 hash; the raw token lives in an httpOnly cookie.
export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tokenHash: text("token_hash"), // null until the setup code is claimed
  setupCode: text("setup_code").unique(), // nulled once claimed
  setupExpires: timestamp("setup_expires", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

// Audit log (ADR-0016): every sign-in attempt (allowed or denied) and every
// directory read (People/Households/Children search, attendance reports) —
// so an admin can see who's accessed the directory and when. Logging is
// best-effort (lib/accessLog.ts never lets a write here fail the request
// it's recording), so this table has no foreign keys into anything else.
export const accessEvents = pgTable(
  "access_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    email: text("email").notNull(),
    // Resolved via lib/roles.ts's resolveRole — set even for a denied sign-in
    // (resolveRole only classifies the email shape, it doesn't itself decide
    // access) so a denied row still shows who they would have been.
    role: text("role").notNull(), // 'admin' | 'staff' | 'volunteer'
    eventType: text("event_type").notNull(), // 'sign_in' | 'sign_in_denied' | 'directory_read'
    // Short label for what was read — e.g. "profiles", "households",
    // "children", "attendance-report". Null for sign_in/sign_in_denied.
    resource: text("resource"),
  },
  (t) => ({
    occurredAtIdx: index("access_events_occurred_at_idx").on(t.occurredAt),
    emailIdx: index("access_events_email_idx").on(t.email),
    roleCheck: check("access_events_role_check", sql`${t.role} in ('admin','staff','volunteer')`),
    eventTypeCheck: check(
      "access_events_event_type_check",
      sql`${t.eventType} in ('sign_in','sign_in_denied','directory_read')`
    ),
  })
);

export type CheckInRow = typeof checkIns.$inferSelect;
export type NewCheckInRow = typeof checkIns.$inferInsert;
export type DeviceRow = typeof devices.$inferSelect;
export type AccessEventRow = typeof accessEvents.$inferSelect;
export type NewAccessEventRow = typeof accessEvents.$inferInsert;
