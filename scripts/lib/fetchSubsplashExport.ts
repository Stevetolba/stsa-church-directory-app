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
// Not confirmed by direct testing (no service-account credentials were
// available during discovery): the exact `maxDate` query param name/format
// for narrowing the report's upper bound, and whether Subsplash occasionally
// interposes a "verify it's you" step on an unfamiliar IP/device — a real
// possibility for a CI runner's IP. If login intermittently fails from CI
// but works when run locally, that's the likely cause; there is no
// unattended fallback for it today.

import { readFile } from "node:fs/promises";
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
    await browser.close();
    throw new Error(
      "Subsplash dashboard login failed — check SUBSPLASH_DASHBOARD_EMAIL/SUBSPLASH_DASHBOARD_PASSWORD, " +
        "or the account may be getting an unrecognized-device/verification prompt this script can't complete unattended."
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
export async function fetchCheckInExportCsv(
  page: Page,
  repeatingEventId: string,
  minDate: Date
): Promise<string> {
  const url =
    `https://dashboard.subsplash.com/-d/#/library/repeating-events/${encodeURIComponent(repeatingEventId)}` +
    `/check-in-report?minDate=${encodeURIComponent(formatDashboardDate(minDate))}`;

  await page.goto(url, { waitUntil: "domcontentloaded" });
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
