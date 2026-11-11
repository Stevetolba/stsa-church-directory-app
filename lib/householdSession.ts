// Session for the household self-update pages. Deliberately NOT part of the
// NextAuth session: several existing routes accept "any signed-in user", so a
// household role in that session would have reached directory data. This is a
// separate HMAC-signed httpOnly cookie that only the /household-update pages
// and /api/household-update routes read — to the rest of the app a household
// visitor is simply signed out.

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const HOUSEHOLD_COOKIE = "household_session";
export const HOUSEHOLD_SESSION_MINUTES = 120;

export interface HouseholdSession {
  profileId: string;
  householdId: string;
  email: string;
  name: string;
  // Epoch milliseconds.
  expiresAt: number;
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(`household-session:${payload}`).digest("base64url");
}

export function createHouseholdSessionToken(
  data: Omit<HouseholdSession, "expiresAt">,
  now: number = Date.now()
): string {
  const session: HouseholdSession = { ...data, expiresAt: now + HOUSEHOLD_SESSION_MINUTES * 60 * 1000 };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

// Returns null for anything malformed, tampered with, or expired.
export function verifyHouseholdSessionToken(token: string | undefined, now: number = Date.now()): HouseholdSession | null {
  if (!token) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<HouseholdSession>;
    if (
      typeof s.profileId !== "string" ||
      typeof s.householdId !== "string" ||
      typeof s.email !== "string" ||
      typeof s.name !== "string" ||
      typeof s.expiresAt !== "number" ||
      s.expiresAt <= now
    ) {
      return null;
    }
    return s as HouseholdSession;
  } catch {
    return null;
  }
}

export function getHouseholdSession(): HouseholdSession | null {
  return verifyHouseholdSessionToken(cookies().get(HOUSEHOLD_COOKIE)?.value);
}

// For server actions / route handlers.
export function setHouseholdSession(data: Omit<HouseholdSession, "expiresAt">): void {
  cookies().set(HOUSEHOLD_COOKIE, createHouseholdSessionToken(data), {
    httpOnly: true,
    ...householdCookieSite(),
    path: "/",
    maxAge: HOUSEHOLD_SESSION_MINUTES * 60,
  });
}

export function clearHouseholdSession(): void {
  // Same site attributes as when it was set, or browsers keep the old cookie.
  cookies().set(HOUSEHOLD_COOKIE, "", { httpOnly: true, ...householdCookieSite(), path: "/", maxAge: 0 });
}

// The household pages are embedded in the Subsplash mobile app, a third-party
// context, where a SameSite=Lax cookie is never sent. In production the cookie
// is SameSite=None; Secure (browsers require Secure with None); on plain-http
// localhost it stays Lax so local development keeps working.
export function householdCookieSite(): { secure: boolean; sameSite: "none" | "lax" } {
  return process.env.NODE_ENV === "production"
    ? { secure: true, sameSite: "none" }
    : { secure: false, sameSite: "lax" };
}

// API guard: the session, or a 401 response. householdId always comes from
// here, never from the request body or URL.
export function requireHouseholdActor(): HouseholdSession | NextResponse {
  const session = getHouseholdSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return session;
}
