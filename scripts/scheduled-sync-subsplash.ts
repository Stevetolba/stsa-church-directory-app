#!/usr/bin/env -S npx tsx
// Fully-unattended attendance sync (ADR-0021) — the scheduled counterpart to
// scripts/sync-subsplash-attendance.ts's manual, hand-a-CSV-to-it flow.
// Opens the Subsplash dashboard, fetches each check-in-enabled series'
// attendee export for a lookback window, and POSTs it to
// /api/attendance/import — no human clicking Export.
//
// Meant to run on a schedule on your own machine (see
// scripts/run-scheduled-sync-local.sh and its own comments for why it's a
// local launchd job, not GitHub Actions) with a 14-day lookback: a missed
// or failed run self-heals on the next one at zero cost, because
// re-importing an overlapping date range is idempotent (see
// lib/attendanceImport.ts).
//
// Usage:
//   nvm use 24
//   npx tsx scripts/scheduled-sync-subsplash.ts
//
// Required env:
//   APP_BASE_URL                 e.g. https://directory.gracechapel.org
//   ATTENDANCE_IMPORT_TOKEN      same value as the app's ATTENDANCE_IMPORT_TOKEN
// Dashboard auth — provide ONE of these:
//   SUBSPLASH_PROFILE_DIR        preferred; a persistent Chrome profile
//                                 directory from scripts/capture-subsplash-session.ts
//                                 (defaults to scripts/.subsplash-profile if unset
//                                 and that directory exists).
//   SUBSPLASH_DASHBOARD_EMAIL /
//   SUBSPLASH_DASHBOARD_PASSWORD fresh login fallback; reliable when run
//                                 locally/interactively.
// Optional env:
//   ORG_TIMEZONE                 default "America/New_York"
//   SYNC_LOOKBACK_DAYS           default 14
//
// This script only ever talks to the Subsplash dashboard (Playwright) and
// the deployed app's own API (GET /api/attendance/series, POST
// /api/attendance/import) — never Subsplash's Core API directly, so it
// doesn't need SUBSPLASH_CLIENT_ID/SECRET etc.; those stay app-side only.

import { existsSync } from "node:fs";
import { parseSubsplashCheckInsCsv } from "../lib/subsplashExportCsv";
import { fetchCheckInEnabledSeries, postAndReportAll } from "./lib/importClient";
import {
  fetchCheckInExportCsv,
  loginToSubsplashDashboard,
  openSubsplashDashboard,
  type SubsplashDashboardSession,
} from "./lib/fetchSubsplashExport";

const DEFAULT_PROFILE_DIR = "scripts/.subsplash-profile";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function openDashboard(): Promise<SubsplashDashboardSession> {
  const profileDir = process.env.SUBSPLASH_PROFILE_DIR ?? DEFAULT_PROFILE_DIR;
  if (existsSync(profileDir)) {
    console.log(`Using saved Subsplash session (${profileDir}).`);
    return openSubsplashDashboard(profileDir);
  }
  const email = process.env.SUBSPLASH_DASHBOARD_EMAIL;
  const password = process.env.SUBSPLASH_DASHBOARD_PASSWORD;
  if (email && password) {
    console.log(`No saved session at ${profileDir} — falling back to a fresh dashboard login.`);
    return loginToSubsplashDashboard(email, password);
  }
  console.error(
    `Missing dashboard auth: run \`npx tsx scripts/capture-subsplash-session.ts\` to create ${profileDir} ` +
      "(preferred), or set both SUBSPLASH_DASHBOARD_EMAIL and SUBSPLASH_DASHBOARD_PASSWORD."
  );
  process.exit(1);
}

async function main() {
  const baseUrl = requireEnv("APP_BASE_URL");
  const token = requireEnv("ATTENDANCE_IMPORT_TOKEN");
  const timeZone = process.env.ORG_TIMEZONE ?? "America/New_York";
  const lookbackDays = Number(process.env.SYNC_LOOKBACK_DAYS ?? "14");

  const minDate = new Date();
  minDate.setDate(minDate.getDate() - lookbackDays);

  const series = await fetchCheckInEnabledSeries(baseUrl, token);
  if (series.length === 0) {
    console.log("No check-in-enabled series found — nothing to sync.");
    return;
  }
  console.log(`Found ${series.length} check-in-enabled series. Lookback: ${lookbackDays} days.`);

  const session = await openDashboard();
  let anyFailed = false;

  try {
    for (const s of series) {
      console.log(`\n=== ${s.title} (${s.seriesId}) ===`);
      try {
        const csvText = await fetchCheckInExportCsv(session.page, s.seriesId, minDate);
        const { occurrences, skipped } = parseSubsplashCheckInsCsv(csvText, {
          timeZone,
          eventTitle: s.title,
          subsplashEventId: s.seriesId,
        });
        const ok = await postAndReportAll(baseUrl, token, occurrences, skipped);
        if (!ok) anyFailed = true;
      } catch (err) {
        // One series' failure (e.g. a transient dashboard hiccup) shouldn't
        // block the others — the lookback window means it self-heals on the
        // next scheduled run regardless.
        console.error(`Failed to sync "${s.title}": ${err}`);
        anyFailed = true;
      }
    }
  } finally {
    await session.close();
  }

  if (anyFailed) {
    console.error("\nCompleted with errors — see above.");
    process.exit(1);
  }
  console.log("\nAll series synced.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
