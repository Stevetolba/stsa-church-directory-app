#!/usr/bin/env -S npx tsx
// One-time interactive capture of an authenticated Subsplash dashboard
// session (ADR-0021), so the scheduled sync can reuse it instead of logging
// in fresh from CI every run. A real CI run showed that a plain
// username/password login is silently rejected — the form submits and
// bounces back to the same login page with no visible error, no 2FA
// challenge shown either — consistent with Subsplash flagging the runner's
// unrecognized IP/device and requiring a verification step no unattended
// script can complete. This sidesteps that: you authenticate once,
// yourself, from a real browser (completing any verification prompt
// Subsplash actually shows you), and the resulting session gets reused.
//
// Run this locally whenever the saved session needs (re-)establishing:
//   nvm use 24
//   npx tsx scripts/capture-subsplash-session.ts
//
// A real (visible) browser window opens to the Subsplash login page — sign
// in yourself. Once you land on the dashboard this script detects it
// automatically and saves the session to scripts/.subsplash-session.json
// (gitignored — never commit it, it's equivalent to a bearer credential).
// Paste its full contents as the SUBSPLASH_SESSION_STATE GitHub secret.
//
// Sessions don't last forever — if the scheduled sync starts failing with
// "Saved Subsplash session is no longer valid", just run this again and
// update the secret.

import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const LOGIN_URL = "https://dashboard.subsplash.com/auth/login";
const OUTPUT_PATH = "scripts/.subsplash-session.json";
const TIMEOUT_MS = 5 * 60 * 1000;

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(LOGIN_URL);

  console.log("A browser window has opened. Sign in to Subsplash there, completing");
  console.log("any verification step it asks for. Waiting up to 5 minutes...");

  const start = Date.now();
  while (page.url().startsWith(LOGIN_URL)) {
    if (Date.now() - start > TIMEOUT_MS) {
      await browser.close();
      console.error("\nTimed out waiting for login. Run this again when you're ready.");
      process.exit(1);
    }
    await page.waitForTimeout(1000);
  }

  console.log("Signed in — capturing session...");
  const state = await context.storageState();
  writeFileSync(OUTPUT_PATH, JSON.stringify(state, null, 2));
  await browser.close();

  console.log(`\nSaved to ${OUTPUT_PATH}.`);
  console.log("Set its full contents as the SUBSPLASH_SESSION_STATE GitHub secret, e.g.:");
  console.log(`  gh secret set SUBSPLASH_SESSION_STATE --repo <owner>/<repo> < ${OUTPUT_PATH}`);
  console.log("\nThis file is a bearer credential (it grants dashboard access without a");
  console.log("password) — never commit it. Delete it locally once the secret is set.");
}

main();
