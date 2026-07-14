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
// coarse gate — it keeps them off the browse surfaces (dashboard stats + the
// full People/Households/Birthdays lists); per-record visibility on the
// detail pages is enforced in those server components. Only the list/root
// paths are blocked so a volunteer can still reach a child's family via
// /people/[id] and /households/[id], which self-guard. The children-scoped
// equivalent of Birthdays lives inside /children (a view toggle, not a
// separate route), so it isn't blocked here.
const VOLUNTEER_BLOCKED_PATHS = new Set(["/", "/people", "/households", "/birthdays"]);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname.startsWith("/login");

  if (!isLoggedIn && !isLoginPage) {
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
