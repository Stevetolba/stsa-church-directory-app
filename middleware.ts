// Route protection — redirects unauthenticated requests to /login and
// signed-in staff away from /login. Scoped to page routes; API routes
// (/api/*) enforce their own session/role checks (ADR-0005) rather than
// relying on a middleware redirect, since a redirect isn't a sane response
// to a fetch() call.

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname.startsWith("/login");

  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
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
