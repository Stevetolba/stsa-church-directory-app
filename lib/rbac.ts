// ADR-0005 — RBAC is server-enforced. Route handlers that mutate data must
// call requireAdmin() themselves; hiding UI affordances is not a guard.

import { NextResponse } from "next/server";
import { auth } from "./auth";

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
export async function requireStaffOrAdmin(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "volunteer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
