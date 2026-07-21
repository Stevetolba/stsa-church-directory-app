import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getEvent, listOccurrences } from "@/lib/events";
import { occurrenceDateInTz } from "@/lib/eventTime";

// ADR-0015: a single event plus its series' recent occurrences (for the report
// occurrence picker). Any authenticated role, same as the list.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = await getEvent(params.id);
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Bounded to today: without it, a series with many scheduled future
  // occurrences would have the plain descending-date-then-limit query return
  // the furthest-future ones instead of the most recent past ones.
  const today = occurrenceDateInTz(new Date().toISOString(), event.timezone);
  const occurrences = await listOccurrences(event.series_id, { to: today, limit: 12 });
  return NextResponse.json({ event, occurrences });
}
