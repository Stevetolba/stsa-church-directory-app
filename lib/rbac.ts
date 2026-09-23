// ADR-0005 — RBAC is server-enforced. Route handlers that mutate data must
// call requireAdmin() themselves; hiding UI affordances is not a guard.

import { NextResponse } from "next/server";
import { auth } from "./auth";
import { recordAccessEvent } from "./accessLog";
import { isSundaySchoolSeriesId } from "./reportAccess";
import type { Role } from "@/types/auth";

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
  // "learner" (ADR-0023) is scoped to training only, same as "volunteer" is
  // denied here — checked as a deny-list of the two non-staff tiers rather
  // than `=== "volunteer"` alone so a learner isn't silently let through.
  if (session.user.role === "volunteer" || session.user.role === "learner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await recordAccessEvent({
    email: session.user.email ?? "unknown",
    name: session.user.name ?? null,
    role: session.user.role,
    eventType: "directory_read",
    resource,
  });
  return null;
}

// Sunday School class volunteers/team leads need to see their own class's
// attendance, so the report/absentees/import-status reads admit a
// volunteer when the series being requested is one of the two Sunday
// School series (lib/reportAccess.ts) — every other series (Liturgy, etc.)
// stays staff/admin only, same as requireStaffOrAdmin. Never grants the
// ability to *send* absentee emails — POST /api/attendance/email still
// uses requireStaffOrAdmin unconditionally.
export async function requireReportAccess(seriesId: string, resource: string): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    (session.user.role === "volunteer" || session.user.role === "learner") &&
    !isSundaySchoolSeriesId(seriesId)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await recordAccessEvent({
    email: session.user.email ?? "unknown",
    name: session.user.name ?? null,
    role: session.user.role,
    eventType: "directory_read",
    resource,
  });
  return null;
}

// ADR-0017: same gate as requireStaffOrAdmin, but also admits a volunteer
// whose Subsplash DirectoryRole is "Team Lead" (session.user.canEmailChildren).
// That's the one permission Team Lead grants — sending the Children/Youth
// "Email Parents" feature — nothing broader like the full profiles/
// households reads requireStaffOrAdmin otherwise gates, so this is scoped to
// that one route rather than folded into requireStaffOrAdmin itself.
export async function requireCanEmailChildren(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    (session.user.role === "volunteer" && !session.user.canEmailChildren) ||
    session.user.role === "learner"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await recordAccessEvent({
    email: session.user.email ?? "unknown",
    name: session.user.name ?? null,
    role: session.user.role,
    eventType: "directory_read",
    resource: "children-email",
  });
  return null;
}

export interface SignedInActor {
  email: string;
  name: string | null;
  role: Role;
  profileId: string | undefined;
}

// ADR-0023: gates the training routes — any signed-in role (including
// "learner") may hit these; each route further scopes by profileId/
// enrollment itself (e.g. a learner only ever reads/writes their own
// progress, on a course they're enrolled in). Unlike requireStaffOrAdmin,
// this deliberately admits every role since training is the one surface a
// learner IS meant to use. Returns the actor's identity directly (instead
// of null) since every training route needs it.
export async function requireSignedIn(): Promise<NextResponse | SignedInActor> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return {
    email: session.user.email,
    name: session.user.name ?? null,
    role: session.user.role,
    profileId: session.user.profileId,
  };
}
