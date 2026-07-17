import { z } from "zod";

// Request bodies for the attendance API (ADR-0015). The server derives
// seriesId/eventId/occurrenceDate/isChild from the authoritative event +
// profile records — the client only names who to check in and (optionally)
// into which session — so a client can't forge occurrence keys or a child flag.

export const checkInSchema = z.object({
  eventId: z.string().trim().min(1, "eventId is required"),
  // Subsplash profile id, or "guest:<uuid>" for a walk-in (isGuest true).
  profileId: z.string().trim().min(1).optional(),
  sessionId: z.string().trim().min(1).optional(),
  // Guest walk-in: no directory profile, just a typed name.
  isGuest: z.boolean().optional(),
  guestName: z.string().trim().min(1, "Name is required").max(120).optional(),
  // For a child, the adult household member who dropped them off. The server
  // re-derives isChild from the authoritative profile and only persists this
  // when the checked-in profile actually is a child — a client can't use this
  // to tag an adult's own check-in.
  dropOffProfileId: z.string().trim().min(1).optional(),
  // Staff/admin only — records after the fact and bypasses the check-in window.
  backfill: z.boolean().optional(),
}).refine((d) => d.isGuest ? !!d.guestName : !!d.profileId, {
  message: "profileId is required (or provide guestName for a guest)",
  path: ["profileId"],
});

export type CheckInValues = z.infer<typeof checkInSchema>;

export const checkOutSchema = z.object({
  eventId: z.string().trim().min(1, "eventId is required"),
  profileId: z.string().trim().min(1, "profileId is required"),
});

export type CheckOutValues = z.infer<typeof checkOutSchema>;

export const removeCheckInSchema = z.object({
  eventId: z.string().trim().min(1, "eventId is required"),
  profileId: z.string().trim().min(1, "profileId is required"),
});
