// Auth check for POST /api/attendance/import (ADR-0021). Accepts either the
// sync script's bearer token (it has no user session) or an admin's own
// signed-in session.

import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

function bearerTokenMatches(request: NextRequest): boolean {
  const expected = process.env.ATTENDANCE_IMPORT_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch rather than returning false —
  // guard that first so a wrong-length token doesn't 500 the request.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAuthorizedForAttendanceImport(request: NextRequest): Promise<boolean> {
  if (bearerTokenMatches(request)) return true;
  const session = await auth();
  return session?.user?.role === "admin";
}
