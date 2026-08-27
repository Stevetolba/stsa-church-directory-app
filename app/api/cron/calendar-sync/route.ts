import { NextResponse, type NextRequest } from "next/server";
import { cronSecretMatches } from "@/lib/cronAuth";
import { syncPublicEventsToCalendar } from "@/lib/calendarSync";

// ADR-0022. Vercel Cron target for the once-daily automatic Google Calendar
// sync (see vercel.json's `crons`) — separate from the admin-only manual
// "Sync to Google Calendar" button (POST /api/events/sync-calendar), since a
// cron invocation has no admin session to authenticate with. Vercel signs
// its own requests to this path with `Authorization: Bearer <CRON_SECRET>`
// once that env var is set; anything else is rejected.
export async function GET(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await syncPublicEventsToCalendar();
  return NextResponse.json({ run });
}
