// Neon Postgres + Drizzle client (ADR-0015). The app deploys to Vercel
// serverless, so we use Neon's HTTP driver — each query is a stateless HTTPS
// call, avoiding connection-pool exhaustion across serverless invocations.
//
// When DATABASE_URL is unset, isDbConfigured() returns false and the
// attendance/device layers fall back to an in-memory globalThis store — so
// `npm run dev` with zero setup exercises the full feature against mock
// events and profiles, mirroring SUBSPLASH_USE_MOCK's mock-by-default stance.

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./db/schema";

export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

// Cached on globalThis so Fast Refresh / separate Next.js module layers reuse
// one client (same rationale as the mock-store singleton in lib/mockData.ts).
declare global {
  // eslint-disable-next-line no-var
  var __attendanceDb: NeonHttpDatabase<typeof schema> | undefined;
}

export function getDb(): NeonHttpDatabase<typeof schema> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set — call isDbConfigured() before getDb().");
  }
  if (!globalThis.__attendanceDb) {
    globalThis.__attendanceDb = drizzle(neon(url), { schema });
  }
  return globalThis.__attendanceDb;
}

export { schema };
