#!/usr/bin/env -S npx tsx
// Attendance sync (ADR-0021): reads a Subsplash Check-In attendee export and
// POSTs it to /api/attendance/import, one occurrence at a time.
//
// This is the manual half of the design: point it at a CSV you exported
// yourself from the Subsplash dashboard (Events → Check-In → an occurrence
// → Export, or the "All Check-ins" range export for a backfill). For the
// scheduled, fully-unattended version (drives the dashboard itself, no CSV
// to download by hand), see scripts/scheduled-sync-subsplash.ts.
//
// Usage:
//   nvm use 24
//   npx tsx scripts/sync-subsplash-attendance.ts \
//     --file ~/Downloads/sunday-school-arlington-check-ins.csv \
//     --event-title "Sunday School — Arlington"
//
// Required env (or pass the equivalent flag):
//   APP_BASE_URL             e.g. https://directory.gracechapel.org
//   ATTENDANCE_IMPORT_TOKEN  same value as the app's ATTENDANCE_IMPORT_TOKEN

import { readFileSync } from "node:fs";
import { parseSubsplashCheckInsCsv } from "../lib/subsplashExportCsv";
import { postAndReportAll } from "./lib/importClient";

interface Args {
  file: string;
  eventTitle?: string;
  eventId?: string;
  baseUrl: string;
  token: string;
  timeZone: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };

  const file = get("--file");
  const eventTitle = get("--event-title");
  const eventId = get("--event-id");
  const baseUrl = get("--base-url") ?? process.env.APP_BASE_URL;
  const token = get("--token") ?? process.env.ATTENDANCE_IMPORT_TOKEN;
  const timeZone = get("--timezone") ?? process.env.ORG_TIMEZONE ?? "America/New_York";

  const problems: string[] = [];
  if (!file) problems.push("--file <path to exported CSV> is required");
  if (!eventTitle && !eventId) problems.push("--event-title or --event-id is required");
  if (!baseUrl) problems.push("--base-url or APP_BASE_URL env is required");
  if (!token) problems.push("--token or ATTENDANCE_IMPORT_TOKEN env is required");
  if (problems.length > 0) {
    console.error("Usage error:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }

  return { file: file!, eventTitle, eventId, baseUrl: baseUrl!, token: token!, timeZone };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const csvText = readFileSync(args.file, "utf-8");

  const { occurrences, skipped } = parseSubsplashCheckInsCsv(csvText, {
    timeZone: args.timeZone,
    eventTitle: args.eventTitle,
    subsplashEventId: args.eventId,
  });

  const ok = await postAndReportAll(args.baseUrl, args.token, occurrences, skipped);
  if (!ok) {
    console.error("Completed with errors — see above.");
    process.exit(1);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
