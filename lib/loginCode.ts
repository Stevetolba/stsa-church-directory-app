// Emailed one-time codes for learner sign-in (ADR-0025). Same dual-path
// convention as lib/training.ts: Neon Postgres via Drizzle when DATABASE_URL
// is set, otherwise an in-memory globalThis store so dev and tests need no
// setup. The code is never stored, only a salted hash.

import { createHash, randomInt, timingSafeEqual } from "crypto";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "./db";
import { loginCodes } from "./db/schema";
import { sendEmail } from "./email";
import { listHouseholdGuardiansByEmail, listLearnerProfilesByEmail } from "./subsplash";
import { listEnrollmentsForProfile } from "./training";
import { CHURCH_NAME, buildHouseholdLoginCodeEmail, buildLoginCodeEmail } from "./trainingEmail";

export const CODE_TTL_MINUTES = 10;
export const MAX_WRONG_GUESSES = 5;
export const MAX_CODES_PER_HOUR = 5;

// A code only works for the sign-in it was issued for, so a training code can
// never open the household-update pages (or the other way round).
export type CodePurpose = "training" | "household";

interface CodeRow {
  id: string;
  email: string;
  purpose: CodePurpose;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  createdAt: Date;
}

declare global {
  // eslint-disable-next-line no-var
  var __loginCodeStore: CodeRow[] | undefined;
}

const mem = () => (globalThis.__loginCodeStore ??= []);
const now = () => new Date();
const normalize = (email: string) => email.trim().toLowerCase();

function hashCode(email: string, code: string, purpose: CodePurpose): string {
  // Training hashes keep their original shape so codes issued before this
  // change still verify during a deploy.
  const salt = purpose === "training" ? "" : `${purpose}:`;
  return createHash("sha256")
    .update(`${salt}${email}:${code.trim()}:${process.env.AUTH_SECRET ?? ""}`)
    .digest("hex");
}

function hashesMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface LearnerCandidate {
  profileId: string;
  name: string;
}

// Active Learner-role profiles on this email that are enrolled in at least
// one course. A person removed from every course keeps the Learner role
// (an admin can't clear it from here, ADR-0023), so enrollment is what
// actually shuts them out.
async function eligibleLearners(email: string): Promise<LearnerCandidate[]> {
  const profiles = await listLearnerProfilesByEmail(email);
  const out: LearnerCandidate[] = [];
  for (const p of profiles) {
    if ((await listEnrollmentsForProfile(p.id)).length > 0) out.push({ profileId: p.id, name: p.name });
  }
  return out;
}

async function latestActiveCode(email: string, purpose: CodePurpose): Promise<CodeRow | null> {
  if (isDbConfigured()) {
    const [row] = await getDb()
      .select()
      .from(loginCodes)
      .where(and(eq(loginCodes.email, email), eq(loginCodes.purpose, purpose), isNull(loginCodes.consumedAt)))
      .orderBy(desc(loginCodes.createdAt))
      .limit(1);
    return row ? { ...row, purpose: row.purpose as CodePurpose } : null;
  }
  return (
    mem()
      .filter((r) => r.email === email && r.purpose === purpose && !r.consumedAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
  );
}

async function countRecentCodes(email: string, purpose: CodePurpose): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  if (isDbConfigured()) {
    const [r] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(loginCodes)
      .where(and(eq(loginCodes.email, email), eq(loginCodes.purpose, purpose), gte(loginCodes.createdAt, since)));
    return r?.n ?? 0;
  }
  return mem().filter((r) => r.email === email && r.purpose === purpose && r.createdAt >= since).length;
}

async function invalidateActiveCodes(email: string, purpose: CodePurpose): Promise<void> {
  if (isDbConfigured()) {
    await getDb()
      .update(loginCodes)
      .set({ consumedAt: now() })
      .where(and(eq(loginCodes.email, email), eq(loginCodes.purpose, purpose), isNull(loginCodes.consumedAt)));
    return;
  }
  for (const r of mem()) if (r.email === email && r.purpose === purpose && !r.consumedAt) r.consumedAt = now();
}

async function insertCode(email: string, codeHash: string, purpose: CodePurpose): Promise<void> {
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  if (isDbConfigured()) {
    await getDb().insert(loginCodes).values({ email, codeHash, expiresAt, purpose });
    return;
  }
  mem().push({
    id: crypto.randomUUID(), email, purpose, codeHash, expiresAt, attempts: 0, consumedAt: null, createdAt: now(),
  });
}

async function bumpAttempts(row: CodeRow): Promise<number> {
  if (isDbConfigured()) {
    const [r] = await getDb()
      .update(loginCodes)
      .set({ attempts: sql`${loginCodes.attempts} + 1` })
      .where(eq(loginCodes.id, row.id))
      .returning({ attempts: loginCodes.attempts });
    return r?.attempts ?? row.attempts + 1;
  }
  const m = mem().find((x) => x.id === row.id);
  if (m) m.attempts += 1;
  return (m?.attempts ?? row.attempts) as number;
}

// True only for the caller that actually flips consumedAt, so two racing
// requests can't both sign in with one code.
async function markConsumed(row: CodeRow): Promise<boolean> {
  if (isDbConfigured()) {
    const rows = await getDb()
      .update(loginCodes)
      .set({ consumedAt: now() })
      .where(and(eq(loginCodes.id, row.id), isNull(loginCodes.consumedAt), gte(loginCodes.expiresAt, now())))
      .returning({ id: loginCodes.id });
    return rows.length === 1;
  }
  const m = mem().find((x) => x.id === row.id);
  if (!m || m.consumedAt || m.expiresAt < now()) return false;
  m.consumedAt = now();
  return true;
}

// Shared by both sign-ins. Always resolves the same way whether or not the
// address is eligible, so it can't be used to find out who is invited.
async function issueCode(
  rawEmail: string,
  purpose: CodePurpose,
  isEligible: (email: string) => Promise<boolean>,
  buildEmail: (code: string) => { subject: string; html: string }
): Promise<void> {
  const email = normalize(rawEmail);
  if (!email) return;
  try {
    if (!(await isEligible(email))) return;
    if ((await countRecentCodes(email, purpose)) >= MAX_CODES_PER_HOUR) return;
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await invalidateActiveCodes(email, purpose);
    await insertCode(email, hashCode(email, code, purpose), purpose);
    const { subject, html } = buildEmail(code);
    await sendEmail({ to: email, fromName: CHURCH_NAME, subject, html });
  } catch (err) {
    console.error("Login code request failed", err);
  }
}

export async function requestLoginCode(rawEmail: string, opts: { logoUrl: string }): Promise<void> {
  await issueCode(
    rawEmail,
    "training",
    async (email) => (await eligibleLearners(email)).length > 0,
    (code) => buildLoginCodeEmail({ code, minutesValid: CODE_TTL_MINUTES, logoUrl: opts.logoUrl })
  );
}

export type CodeFailure = "invalid" | "expired" | "wrong" | "locked";

async function verifyCode(
  email: string,
  code: string,
  purpose: CodePurpose
): Promise<{ ok: true; row: CodeRow } | { ok: false; reason: CodeFailure }> {
  const row = await latestActiveCode(email, purpose);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.expiresAt < now()) return { ok: false, reason: "expired" };
  if (row.attempts >= MAX_WRONG_GUESSES) return { ok: false, reason: "locked" };
  if (!hashesMatch(row.codeHash, hashCode(email, code, purpose))) {
    const attempts = await bumpAttempts(row);
    return { ok: false, reason: attempts >= MAX_WRONG_GUESSES ? "locked" : "wrong" };
  }
  return { ok: true, row };
}

// Verifies the code without using it up, and says who could be signing in —
// more than one when learners share an email, so the page can ask which.
export async function checkLoginCode(
  rawEmail: string,
  code: string
): Promise<{ ok: true; candidates: LearnerCandidate[] } | { ok: false; reason: CodeFailure }> {
  const email = normalize(rawEmail);
  const v = await verifyCode(email, code, "training");
  if (!v.ok) return v;
  const candidates = await eligibleLearners(email);
  if (candidates.length === 0) return { ok: false, reason: "invalid" };
  return { ok: true, candidates };
}

// Verifies and uses up the code for one chosen learner. Returns the user
// NextAuth's Credentials provider expects, or null.
export async function consumeLoginCode(
  rawEmail: string,
  code: string,
  profileId: string
): Promise<{ id: string; email: string; name: string } | null> {
  const email = normalize(rawEmail);
  const v = await verifyCode(email, code, "training");
  if (!v.ok) return null;
  const chosen = (await eligibleLearners(email)).find((c) => c.profileId === profileId);
  if (!chosen) return null;
  if (!(await markConsumed(v.row))) return null;
  return { id: chosen.profileId, email, name: chosen.name };
}

// ---------------------------------------------------------------------------
// Household self-update sign-in. Same code mechanics, but eligibility is "a
// parent/guardian profile on this email that belongs to a household", and
// the sign-in carries the household it unlocks.

export interface HouseholdCandidate {
  profileId: string;
  name: string;
  householdId: string;
  householdName?: string;
}

async function eligibleHouseholdAdults(email: string): Promise<HouseholdCandidate[]> {
  const guardians = await listHouseholdGuardiansByEmail(email);
  return guardians.map((g) => ({
    profileId: g.id,
    name: g.name,
    householdId: g.householdId,
    householdName: g.householdName,
  }));
}

export async function requestHouseholdLoginCode(rawEmail: string, opts: { logoUrl: string }): Promise<void> {
  await issueCode(
    rawEmail,
    "household",
    async (email) => (await eligibleHouseholdAdults(email)).length > 0,
    (code) => buildHouseholdLoginCodeEmail({ code, minutesValid: CODE_TTL_MINUTES, logoUrl: opts.logoUrl })
  );
}

export async function checkHouseholdLoginCode(
  rawEmail: string,
  code: string
): Promise<{ ok: true; candidates: HouseholdCandidate[] } | { ok: false; reason: CodeFailure }> {
  const email = normalize(rawEmail);
  const v = await verifyCode(email, code, "household");
  if (!v.ok) return v;
  const candidates = await eligibleHouseholdAdults(email);
  if (candidates.length === 0) return { ok: false, reason: "invalid" };
  return { ok: true, candidates };
}

// Uses up the code for one chosen guardian. The household comes from
// Subsplash here, never from the caller, so a signed-in session can only ever
// be tied to the household that profile really belongs to.
export async function consumeHouseholdLoginCode(
  rawEmail: string,
  code: string,
  profileId: string
): Promise<{ id: string; email: string; name: string; householdId: string } | null> {
  const email = normalize(rawEmail);
  const v = await verifyCode(email, code, "household");
  if (!v.ok) return null;
  const chosen = (await eligibleHouseholdAdults(email)).find((c) => c.profileId === profileId);
  if (!chosen) return null;
  if (!(await markConsumed(v.row))) return null;
  return { id: chosen.profileId, email, name: chosen.name, householdId: chosen.householdId };
}
