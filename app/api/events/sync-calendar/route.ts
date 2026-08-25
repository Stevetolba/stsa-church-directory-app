import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { lastCalendarSync, syncPublicEventsToCalendar } from "@/lib/calendarSync";

// ADR-0022. Admin-only manual sync of public Subsplash events onto the STSA
// Church Public Google Calendar — triggered by the "Sync to Google Calendar"
// button on the Events page. POST runs the sync; GET returns the last run
// for the page's status banner on load, same shape as
// GET /api/attendance/imports.
export async function POST() {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const run = await syncPublicEventsToCalendar();
  return NextResponse.json({ run });
}

export async function GET() {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const run = await lastCalendarSync();
  return NextResponse.json({ run });
}
