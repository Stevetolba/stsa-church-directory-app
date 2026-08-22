import { z } from "zod";

// Request body for the attendance import endpoint (ADR-0021). Attendance is
// captured in Subsplash Check-In and pulled in on a schedule — this is the
// shape the importer script POSTs, one occurrence at a time.

export const attendanceImportAttendeeSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  // Confirmed against a real Subsplash export (ADR-0021): for a child, this
  // column is often the *guardian's* email, not the child's own — Subsplash
  // check-in populates it from the household's default contact. Never used
  // as the sole match key against the directory for exactly that reason
  // (see resolveAttendee in lib/attendanceImport.ts) — treated as a
  // disambiguation signal only, not an identity one.
  email: z.string().trim().email().optional(),
  subsplashProfileId: z.string().trim().min(1).optional(),
  sessionName: z.string().trim().min(1).optional(),
  checkedInAt: z.string().trim().min(1).optional(), // ISO 8601, defaults to now
  checkedOutAt: z.string().trim().min(1).optional(), // ISO 8601, omitted = not checked out
  isChild: z.boolean().optional(),
  // The adult who dropped this attendee off ("[Checked in by]" in the
  // export) — reliably that adult's own name/email, unlike the attendee's
  // own email column above. Optional since a guest/adult self-check-in row
  // has no separate drop-off adult.
  droppedOffByName: z.string().trim().min(1).max(200).optional(),
  droppedOffByEmail: z.string().trim().email().optional(),
  // Subsplash's own pickup/security code, printed on their label — stored
  // and displayed as-is, not validated to a format we don't control.
  matchCode: z.string().trim().min(1).max(20).optional(),
});

export const attendanceImportOccurrenceSchema = z.object({
  // At least one of these must resolve to a known series/event — validated
  // in lib/attendanceImport.ts, not here, since it needs a DB/Subsplash
  // lookup this schema can't perform.
  subsplashEventId: z.string().trim().min(1).optional(),
  eventTitle: z.string().trim().min(1).optional(),
  occurrenceDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "occurrenceDate must be YYYY-MM-DD"),
  attendees: z.array(attendanceImportAttendeeSchema),
});

export const attendanceImportRequestSchema = z.object({
  source: z.literal("subsplash"),
  occurrences: z.array(attendanceImportOccurrenceSchema).min(1),
});

export type AttendanceImportAttendee = z.infer<typeof attendanceImportAttendeeSchema>;
export type AttendanceImportOccurrence = z.infer<typeof attendanceImportOccurrenceSchema>;
export type AttendanceImportRequest = z.infer<typeof attendanceImportRequestSchema>;
