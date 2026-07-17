import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { listEvents, listTodaysEvents } from "@/lib/events";

// ADR-0015: event list for the check-in surfaces. Open to any authenticated
// role — event titles/times aren't member PII, and volunteers need the picker
// to run check-in. Attendance data itself is guarded separately.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get("today") === "true") {
    return NextResponse.json({ events: await listTodaysEvents() });
  }

  const events = await listEvents({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    includeDrafts: searchParams.get("includeDrafts") === "true",
  });
  return NextResponse.json({ events });
}
