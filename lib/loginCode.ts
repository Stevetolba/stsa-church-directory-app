// Emailed one-time codes for learner sign-in (ADR-0025). Same dual-path
// convention as lib/training.ts: Neon Postgres via Drizzle when DATABASE_URL
// is set, otherwise an in-memory globalThis store so dev and tests need no
// setup. The code is never stored, only a salted hash.

import { createHash, randomInt, timingSafeEqual } from "crypto";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "./db";
import { loginCodes } from "./db/schema";
import { sendEmail } from "./email";
import { listLearnerProfilesByEmail } from "./subsplash";
import { listEnrollmentsForProfile } from "./training";
import { CHURCH_NAME, buildLoginCodeEmail } from "./trainingEmail";

export const CODE_TTL_MINUTES = 10;
export const MAX_WRONG_GUESSES = 5;
export const MAX_CODES_PER_HOUR = 5;

interface CodeRow {
  id: string;
  email: string;
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

function hashCode(email: string, code: string): string {
  return createHash("sha256")
    .update(`${email}:${code.trim()}:${process.env.AUTH_SECRET ?? ""}`)
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

async function latestActiveCode(email: string): Promise<CodeRow | null> {
  if (isDbConfigured()) {
    const [row] = await getDb()
      .select()
      .from(loginCodes)
      .where(and(eq(loginCodes.email, email), isNull(loginCodes.consumedAt)))
      .orderBy(desc(loginCodes.createdAt))
      .limit(1);
    return row ?? null;
  }
  return (
    mem()
      .filter((r) => r.email === email && !r.consumedAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
  );
}

async function countRecentCodes(email: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  if (isDbConfigured()) {
    const [r] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(loginCodes)
      .where(and(eq(loginCodes.email, email), gte(loginCodes.createdAt, since)));
    return r?.n ?? 0;
  }
  return mem().filter((r) => r.email === email && r.createdAt >= since).length;
}

async function invalidateActiveCodes(email: string): Promise<void> {
  if (isDbConfigured()) {
    await getDb()
      .update(loginCodes)
      .set({ consumedAt: now() })
      .where(and(eq(loginCodes.email, email), isNull(loginCodes.consumedAt)));
    return;
  }
  for (const r of mem()) if (r.email === email && !r.consumedAt) r.consumedAt = now();
}

async function insertCode(email: string, codeHash: string): Promise<void> {
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  if (isDbConfigured()) {
    await getDb().insert(loginCodes).values({ email, codeHash, expiresAt });
    return;
  }
  mem().push({ id: crypto.randomUUID(), email, codeHash, expiresAt, attempts: 0, consumedAt: null, createdAt: now() });
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

// Always resolves the same way whether or not the address belongs to an
// eligible learner, so it can't be used to find out who is invited.
export async function requestLoginCode(rawEmail: string, opts: { logoUrl: string }): Promise<void> {
  const email = normalize(rawEmail);
  if (!email) return;
  try {
    if ((await eligibleLearners(email)).length === 0) return;
    if ((await countRecentCodes(email)) >= MAX_CODES_PER_HOUR) return;
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await invalidateActiveCodes(email);
    await insertCode(email, hashCode(email, code));
    const { subject, html } = buildLoginCodeEmail({ code, minutesValid: CODE_TTL_MINUTES, logoUrl: opts.logoUrl });
    await sendEmail({ to: email, fromName: CHURCH_NAME, subject, html });
  } catch (err) {
    console.error("Login code request failed", err);
  }
}

export type CodeFailure = "invalid" | "expired" | "wrong" | "locked";

async function verifyCode(
  email: string,
  code: string
): Promise<{ ok: true; row: CodeRow } | { ok: false; reason: CodeFailure }> {
  const row = await latestActiveCode(email);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.expiresAt < now()) return { ok: false, reason: "expired" };
  if (row.attempts >= MAX_WRONG_GUESSES) return { ok: false, reason: "locked" };
  if (!hashesMatch(row.codeHash, hashCode(email, code))) {
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
  const v = await verifyCode(email, code);
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
  const v = await verifyCode(email, code);
  if (!v.ok) return null;
  const chosen = (await eligibleLearners(email)).find((c) => c.profileId === profileId);
  if (!chosen) return null;
  if (!(await markConsumed(v.row))) return null;
  return { id: chosen.profileId, email, name: chosen.name };
}
