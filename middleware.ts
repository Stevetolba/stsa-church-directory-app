// Route protection — redirects unauthenticated requests to /login and
// signed-in staff away from /login. Scoped to page routes; API routes
// (/api/*) enforce their own session/role checks (ADR-0005) rather than
// relying on a middleware redirect, since a redirect isn't a sane response
// to a fetch() call.

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { resolveRole } from "@/lib/roles";

const { auth } = NextAuth(authConfig);

// ADR-0011: volunteers are scoped to the Children directory. This is the
// coarse gate — it keeps them off the browse surfaces (the full
// People/Households/Birthdays lists); per-record visibility on the detail
// pages is enforced in those server components. Only the list paths are
// blocked so a volunteer can still reach a child's family via /people/[id]
// and /households/[id], which self-guard. The children-scoped equivalent of
// Birthdays lives inside /children (a view toggle, not a separate route), so
// it isn't blocked here. "/" is intentionally NOT blocked — it renders a
// volunteer-scoped landing page (today's children/youth birthdays + a
// children-only search) instead of the staff/admin one, so a volunteer can
// land there directly rather than being redirected off it.
const VOLUNTEER_BLOCKED_PATHS = new Set(["/people", "/households", "/birthdays", "/reports", "/settings/devices"]);

// ADR-0015 (Phase 3): /kiosk (and /kiosk/setup, where a device claims its
// setup code and has no cookie yet) authorize via a device cookie instead of
// a NextAuth session — middleware only relaxes the redirect here, it doesn't
// validate the cookie itself (that needs a DB lookup, not Edge-safe). The
// page/route handlers underneath call getAttendanceActor / verifyDeviceToken
// and reject anyone with neither a session nor a valid device token.
const KIOSK_PATH_PREFIX = "/kiosk";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname.startsWith("/login");
  const isKioskPath =
    req.nextUrl.pathname === KIOSK_PATH_PREFIX || req.nextUrl.pathname.startsWith(`${KIOSK_PATH_PREFIX}/`);

  if (!isLoggedIn && !isLoginPage && !isKioskPath) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  if (isLoggedIn && VOLUNTEER_BLOCKED_PATHS.has(req.nextUrl.pathname)) {
    // authConfig has no session callback, so req.auth doesn't carry `role` —
    // but it carries the (verified) email, and resolveRole is pure env+string
    // logic (Edge-safe), giving the same tier as the stored token. Only
    // redirect when we positively identify a volunteer: this gate is UX/
    // defense-in-depth, and the real enforcement is the API 403
    // (requireStaffOrAdmin) plus the detail-page guards — so if the email is
    // somehow absent we let the request through rather than risk bouncing a
    // staff/admin, and the hard guards still protect the data.
    const email = req.auth?.user?.email;
    if (email && resolveRole(email) === "volunteer") {
      return NextResponse.redirect(new URL("/children", req.nextUrl.origin));
    }
  }

  return NextResponse.next();
});

export const config = {
  // Excludes API routes, Next internals, and any request for a static file
  // (anything with a dot in the path, e.g. /stsa-logo.png, /favicon.ico) —
  // public assets must never redirect to /login (breaks next/image, which
  // internally fetches them and got the login page back instead).
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
