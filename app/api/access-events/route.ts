import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { listAccessEvents } from "@/lib/accessLog";

// ADR-0016: admin-only read of the audit log powering the Activity Log
// settings page — who signed in (or was denied) and who read directory
// data, most recent first. Deliberately not gated via requireStaffOrAdmin —
// the log itself is admin-only, unlike the directory reads it records.
export async function GET(request: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const events = await listAccessEvents(limit);
  return NextResponse.json({ events });
}
