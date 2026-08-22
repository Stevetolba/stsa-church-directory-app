#!/usr/bin/env -S npx tsx
// One-time interactive capture of an authenticated Subsplash dashboard
// session (ADR-0021), so the local scheduled sync can reuse it instead of
// logging in fresh every run.
//
// Uses a persistent Chrome profile directory, not Playwright's
// storageState() snapshot. Confirmed necessary the hard way: a first
// capture attempt using storageState() produced a file containing only
// Google Analytics and reCAPTCHA cookies — no real Subsplash auth data at
// all — despite the browser visibly showing the signed-in dashboard.
// storageState() only captures cookies and localStorage; Subsplash's actual
// session apparently lives elsewhere (IndexedDB is the common place modern
// auth libraries put it), which storageState() silently omits. A persistent
// profile directory (the same thing a normal Chrome profile is) preserves
// all of it, because it's not a snapshot of anything in particular — it's
// where the browser itself was already writing this data as you signed in.
//
// Also confirmed the two most tempting alternatives DON'T work: a fresh
// username/password login from CI is silently rejected (Subsplash flags an
// unrecognized IP/device), and — separately — even a *complete*, valid
// session presented from a different machine/network than it was
// established on gets rejected too. So this needs to run on the same
// machine that will later run the scheduled sync, on the same network —
// see scripts/run-scheduled-sync-local.sh, which is built around exactly
// that (a local launchd job, not GitHub Actions).
//
// Run this locally whenever the saved session needs (re-)establishing:
//   nvm use 24
//   npx tsx scripts/capture-subsplash-session.ts
//
// A real (visible) browser window opens to the Subsplash login page — sign
// in yourself, completing any verification step Subsplash asks for. Once
// you land on the dashboard this script detects it automatically and closes
// the window. Nothing to copy anywhere afterward — the profile directory at
// scripts/.subsplash-profile/ (gitignored) *is* the saved session;
// scripts/scheduled-sync-subsplash.ts reads it directly by default.
//
// Sessions don't last forever — if the scheduled sync starts failing with
// "Saved Subsplash session is no longer valid", just run this again.

import { chromium } from "playwright";

const LOGIN_URL = "https://dashboard.subsplash.com/auth/login";
export const PROFILE_DIR = "scripts/.subsplash-profile";
const TIMEOUT_MS = 5 * 60 * 1000;

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(LOGIN_URL);

  console.log("A browser window has opened. Sign in to Subsplash there, completing");
  console.log("any verification step it asks for. Waiting up to 5 minutes...");

  const start = Date.now();
  while (page.url().startsWith(LOGIN_URL)) {
    if (Date.now() - start > TIMEOUT_MS) {
      await context.close();
      console.error("\nTimed out waiting for login. Run this again when you're ready.");
      process.exit(1);
    }
    await page.waitForTimeout(1000);
  }

  console.log("Signed in — letting the app finish settling before closing...");
  // Give the app a few seconds to finish writing whatever it writes right
  // after landing (IndexedDB, etc.) before the profile directory is closed
  // and considered final.
  await page.waitForTimeout(3000);
  await context.close();

  console.log(`\nSaved to ${PROFILE_DIR}/ (a full browser profile — a directory, not a single file).`);
  console.log("Nothing to copy anywhere — scripts/scheduled-sync-subsplash.ts reads it directly by default.");
  console.log("This directory is a bearer credential (it grants dashboard access, no password needed) —");
  console.log("never commit it (already gitignored).");
}

main();
