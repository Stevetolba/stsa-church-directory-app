// Admin-controlled switches stored in Postgres (app_settings), with an
// in-memory fallback when DATABASE_URL is unset so dev and tests need no setup
// (same dual-path convention as lib/householdUpdates.ts).

import { eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "./db";
import { appSettings } from "./db/schema";

const HOUSEHOLD_AUTO_APPLY = "household_auto_apply";

declare global {
  // eslint-disable-next-line no-var
  var __appSettingsStore: Map<string, unknown> | undefined;
}
const mem = () => (globalThis.__appSettingsStore ??= new Map<string, unknown>());

async function getFlag(key: string): Promise<boolean> {
  if (isDbConfigured()) {
    const [row] = await getDb().select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    return row?.value === true;
  }
  return mem().get(key) === true;
}

async function setFlag(key: string, on: boolean, email: string): Promise<void> {
  if (isDbConfigured()) {
    await getDb()
      .insert(appSettings)
      .values({ key, value: on, updatedByEmail: email })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: on, updatedByEmail: email, updatedAt: new Date() } });
    return;
  }
  mem().set(key, on);
}

// ADR-0031: when on, a household's edits to existing people and the household
// address are written to Subsplash as soon as they submit. Off by default.
export const getHouseholdAutoApply = () => getFlag(HOUSEHOLD_AUTO_APPLY);
export const setHouseholdAutoApply = (on: boolean, email: string) => setFlag(HOUSEHOLD_AUTO_APPLY, on, email);
