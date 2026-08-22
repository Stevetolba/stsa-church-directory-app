// Drives the Subsplash dashboard itself to produce a Check-In attendee
// export, for the fully-unattended half of ADR-0021's sync design.
//
// Confirmed directly against the live dashboard (2026-08-21) rather than
// guessed:
//   - Login is a plain email/password form at
//     https://dashboard.subsplash.com/auth/login (fields named "email" and
//     "password", a type="submit" button) — no SSO/2FA in front of it for a
//     standard account.
//   - A series' Check-In attendance report lives at a stable, shareable URL:
//     https://dashboard.subsplash.com/-d/#/library/repeating-events/{id}/check-in-report?minDate=M/D/YYYY
//     where {id} is exactly the Subsplash repeating-event id — the same
//     value lib/events.ts's listSeries() already exposes as `seriesId`
//     (raw._embedded["repeating-event"].id). No separate id lookup needed.
//   - Its Export button does not call a distinct API at click time — it
//     assembles a ZIP client-side (confirmed via the "PK\x03\x04" magic
//     bytes and an "All Check-ins.csv" entry name) from data the page
//     already loaded, and triggers a real browser download of it (confirmed
//     by the file landing in ~/Downloads, not just an in-page blob URL) —
//     so Playwright's native `download` event is the reliable way to
//     capture it, rather than reverse-engineering an internal data API that
//     doesn't exist as a stable request.
//
// Not confirmed by direct testing: the exact `maxDate` query param
// name/format for narrowing the report's upper bound.
//
// CONFIRMED on the first real CI run: a fresh username/password login is
// silently rejected from a GitHub Actions runner — the form submits and
// bounces back to the same plain login page (no error text, no 2FA/OTP
// screen shown either), with valid, human-confirmed credentials. Most
// consistent explanation: Subsplash flags the runner's IP/device as
// unrecognized and rejects the attempt outright, rather than presenting a
// challenge an unattended script could complete. So openSubsplashDashboard
// below (a saved, pre-authenticated session) is the primary path for CI;
// loginToSubsplashDashboard (fresh username/password) is kept for local/
// interactive use where that device-trust problem doesn't apply, and as the
// mechanism scripts/capture-subsplash-session.ts itself uses to establish
// the session in the first place.
//
// CONFIRMED on a full real run against all 34 of the org's series (with a
// valid saved session): a fresh page.goto() straight to a series' deep hash
// route — i.e. what fetchCheckInExportCsv originally did — bounces through
// /auth/logout?redirect=... and never returns, 100% reproducibly, on every
// single series. The dashboard is an Ember app (hash-routed); a real user
// is always already sitting on a booted instance of it and clicks through,
// which is a same-document hash change, not a fresh top-level navigation.
// fetchCheckInExportCsv now sets location.hash via page.evaluate() instead
// of page.goto() for exactly that reason — see its own comment.

import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { strFromU8, unzipSync } from "fflate";

const LOGIN_URL = "https://dashboard.subsplash.com/auth/login";

export interface SubsplashDashboardSession {
  browser: Browser;
  page: Page;
}

export async function loginToSubsplashDashboard(
  email: string,
  password: string
): Promise<SubsplashDashboardSession> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([
    page.waitForLoadState("networkidle"),
    page.click('button[type="submit"]'),
  ]);

  if (page.url().startsWith(LOGIN_URL)) {
    // Capture what's actually on screen before closing — a CI failure here
    // is otherwise a black box: "login failed" could mean a wrong password,
    // an unrecognized-device/verification prompt, or something else
    // entirely, and there's no way to tell without seeing the page.
    const debugDir = process.env.SUBSPLASH_LOGIN_DEBUG_DIR ?? ".";
    const screenshotPath = `${debugDir}/subsplash-login-failure.png`;
    let pageText = "";
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      pageText = (await page.locator("body").innerText()).trim().slice(0, 500);
    } catch {
      // Best-effort — a broken page shouldn't hide the more useful error below.
    }
    await browser.close();
    throw new Error(
      "Subsplash dashboard login failed — check SUBSPLASH_DASHBOARD_EMAIL/SUBSPLASH_DASHBOARD_PASSWORD, " +
        "or the account may be getting an unrecognized-device/verification prompt this script can't complete " +
        `unattended. Screenshot saved to ${screenshotPath}. Page text: ${JSON.stringify(pageText)}`
    );
  }

  return { browser, page };
}

const DASHBOARD_ROOT_URL = "https://dashboard.subsplash.com/-d/";

// Opens a dashboard session from a previously-captured storageState (see
// scripts/capture-subsplash-session.ts) instead of logging in fresh — the
// path CI actually uses, since a fresh login from CI is unreliable (see the
// module comment above).
export async function openSubsplashDashboard(storageStateJson: string): Promise<SubsplashDashboardSession> {
  try {
    JSON.parse(storageStateJson);
  } catch {
    throw new Error("SUBSPLASH_SESSION_STATE is not valid JSON — re-run scripts/capture-subsplash-session.ts");
  }

  // Playwright's storageState option treats a string as a *file path*, not
  // raw JSON — write it out to a temp file first.
  const statePath = join(tmpdir(), `subsplash-session-${randomUUID()}.json`);
  await writeFile(statePath, storageStateJson, "utf-8");

  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: statePath });
  const page = await context.newPage();
  await page.goto(DASHBOARD_ROOT_URL, { waitUntil: "domcontentloaded" });

  if (page.url().startsWith(LOGIN_URL)) {
    await browser.close();
    throw new Error(
      "Saved Subsplash session is no longer valid (expired or revoked). Re-run " +
        "`npx tsx scripts/capture-subsplash-session.ts` locally and update the SUBSPLASH_SESSION_STATE secret."
    );
  }

  return { browser, page };
}

// M/D/YYYY, no leading zeros — the exact format observed in a real
// dashboard URL (?minDate=1%2F1%2F2026 for January 1, 2026).
export function formatDashboardDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

// Navigates to one series' Check-In attendance report and captures the
// Export button's downloaded ZIP, returning the CSV text inside it.
//
// CONFIRMED against a real run syncing all 34 real series: a fresh
// page.goto() straight to a deep hash route — the equivalent of pasting the
// URL into a new tab — makes the dashboard (an Ember app, hash-routed)
// bounce through /auth/logout?redirect=... and never come back, on every
// single series, 100% reproducibly. A real user never does that; they're
// always already sitting on a booted dashboard and click through to the
// report, i.e. a same-document hash change, not a fresh top-level
// navigation. So this sets location.hash via page.evaluate() instead — a
// real hashchange event, exactly what an in-app click produces — and lets
// the already-booted app's own router handle it, rather than repeating
// whatever cold-boot-into-a-protected-deep-route check is rejecting the
// saved session.
export async function fetchCheckInExportCsv(
  page: Page,
  repeatingEventId: string,
  minDate: Date
): Promise<string> {
  const hash =
    `#/library/repeating-events/${encodeURIComponent(repeatingEventId)}` +
    `/check-in-report?minDate=${encodeURIComponent(formatDashboardDate(minDate))}`;

  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.getByRole("button", { name: "Export" }).waitFor({ timeout: 30_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    page.getByRole("button", { name: "Export" }).click(),
  ]);

  const zipPath = await download.path();
  if (!zipPath) {
    throw new Error(`Export for repeating event ${repeatingEventId} produced no downloadable file`);
  }
  const zipBytes = new Uint8Array(await readFile(zipPath));
  const entries = unzipSync(zipBytes);
  const csvName = Object.keys(entries).find((name) => name.toLowerCase().endsWith(".csv"));
  if (!csvName) {
    throw new Error(`Export ZIP for repeating event ${repeatingEventId} contained no CSV entry`);
  }
  return strFromU8(entries[csvName]);
}
