// Send-once tracking for the weekly Sunday School attendance email
// (ADR-0028). Same DB / in-memory split as lib/attendance.ts.

import { and, eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "./db";
import { attendanceReportSends } from "./db/schema";

declare global {
  // eslint-disable-next-line no-var
  var __attendanceReportSends: Set<string> | undefined;
}

function mockSet(): Set<string> {
  return (globalThis.__attendanceReportSends ??= new Set());
}

// Atomically claims the (campus, Sunday) slot. True = this caller owns the
// send; false = already claimed/sent (by an earlier or concurrent run).
export async function claimReportSend(campus: string, sunday: string): Promise<boolean> {
  if (isDbConfigured()) {
    const rows = await getDb()
      .insert(attendanceReportSends)
      .values({ campus, sundayDate: sunday })
      .onConflictDoNothing()
      .returning({ id: attendanceReportSends.id });
    return rows.length > 0;
  }
  const key = `${campus}|${sunday}`;
  if (mockSet().has(key)) return false;
  mockSet().add(key);
  return true;
}

// Gives the slot back after a failed send so the next daily run retries.
export async function releaseReportSend(campus: string, sunday: string): Promise<void> {
  if (isDbConfigured()) {
    await getDb()
      .delete(attendanceReportSends)
      .where(and(eq(attendanceReportSends.campus, campus), eq(attendanceReportSends.sundayDate, sunday)));
    return;
  }
  mockSet().delete(`${campus}|${sunday}`);
}

export async function recordReportRecipients(campus: string, sunday: string, recipients: number): Promise<void> {
  if (!isDbConfigured()) return;
  await getDb()
    .update(attendanceReportSends)
    .set({ recipients })
    .where(and(eq(attendanceReportSends.campus, campus), eq(attendanceReportSends.sundayDate, sunday)));
}
