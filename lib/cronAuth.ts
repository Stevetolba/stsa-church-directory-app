// Auth check for Vercel Cron-triggered routes. Vercel automatically sends
// `Authorization: Bearer <CRON_SECRET>` on requests it makes to a path
// listed in vercel.json's `crons`, when the CRON_SECRET env var is set —
// this verifies that header matches. Same timing-safe-compare shape as
// lib/attendanceImportAuth.ts's bearerTokenMatches, for the same reason:
// a naive `===` leaks the secret's length/prefix through response timing.

import { timingSafeEqual } from "crypto";

export function cronSecretMatches(authHeader: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const [scheme, token] = (authHeader ?? "").split(" ");
  if (scheme !== "Bearer" || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch rather than returning false —
  // guard that first so a wrong-length token doesn't 500 the request.
  return a.length === b.length && timingSafeEqual(a, b);
}
