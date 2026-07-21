// ADR-0005 — RBAC is server-enforced. Route handlers that mutate data must
// call requireAdmin() themselves; hiding UI affordances is not a guard.

import { NextResponse } from "next/server";
import { auth } from "./auth";
import { recordAccessEvent } from "./accessLog";

export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

// ADR-0011: gates the full-directory read endpoints (/api/profiles,
// /api/households) so volunteers can't reach adult PII through them — they use
// /api/children instead. Returns 401 unauthenticated, 403 for volunteers, null
// (pass) for staff/admin.
//
// ADR-0016: every route that calls this is a directory *read* (never a
// mutation — writes go through requireAdmin instead), so a passing call is
// logged as a directory_read access event. `resource` is a short caller-
// supplied label (e.g. "profiles", "attendance-report") identifying what was
// read, since this helper has no request object of its own to derive one from.
export async function requireStaffOrAdmin(resource: string): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "volunteer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await recordAccessEvent({
    email: session.user.email ?? "unknown",
    role: session.user.role,
    eventType: "directory_read",
    resource,
  });
  return null;
}
