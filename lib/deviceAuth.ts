// Kiosk device auth (ADR-0015, Phase 3): a one-time setup code lets an iPad
// authorize itself for check-in/out without anyone signing in. The raw
// device token lives only in an httpOnly cookie on the device; the server
// stores just its SHA-256 hash, so a DB leak alone can't be used to
// impersonate a device. Two interchangeable implementations (Neon / an
// in-memory globalThis array), selected by isDbConfigured() — same pattern
// as lib/attendance.ts.

import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb, isDbConfigured } from "./db";
import { devices, type DeviceRow } from "./db/schema";
import type { Role } from "@/types/auth";

export const DEVICE_COOKIE_NAME = "kiosk_device";

const SETUP_CODE_LENGTH = 6;
// Excludes visually-ambiguous characters (0/O, 1/I/L) — a human reads this
// off a screen and types it into a shared iPad.
const SETUP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SETUP_CODE_TTL_MS = 15 * 60 * 1000;
const TOKEN_BYTES = 32; // 256 bits

function randomCode(alphabet: string, length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DeviceRecord {
  id: string;
  name: string;
  claimed: boolean;
  setupCode: string | null; // only present while unclaimed and unexpired
  setupExpires: string | null;
  createdBy: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

function fromRow(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    name: row.name,
    claimed: !!row.tokenHash,
    setupCode: row.setupCode,
    setupExpires: row.setupExpires ? row.setupExpires.toISOString() : null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

// --- Mock store (mirrors lib/attendance.ts's globalThis pattern) ---

declare global {
  // eslint-disable-next-line no-var
  var __mockDevices: DeviceRow[] | undefined;
}

function mockStore(): DeviceRow[] {
  return (globalThis.__mockDevices ??= []);
}

function mockRow(partial: Partial<DeviceRow> & Pick<DeviceRow, "id" | "name" | "createdBy">): DeviceRow {
  return {
    tokenHash: null,
    setupCode: null,
    setupExpires: null,
    createdAt: new Date(),
    lastSeenAt: null,
    revokedAt: null,
    ...partial,
  };
}

// --- Public API ---

export async function createDeviceSetupCode(name: string, createdBy: string): Promise<DeviceRecord> {
  const setupCode = randomCode(SETUP_CODE_ALPHABET, SETUP_CODE_LENGTH);
  const setupExpires = new Date(Date.now() + SETUP_CODE_TTL_MS);

  if (isDbConfigured()) {
    const db = getDb();
    const [row] = await db
      .insert(devices)
      .values({ name, createdBy, setupCode, setupExpires })
      .returning();
    return fromRow(row);
  }

  const row = mockRow({ id: `device-${crypto.randomUUID()}`, name, createdBy, setupCode, setupExpires });
  mockStore().push(row);
  return fromRow(row);
}

export async function listDevices(): Promise<DeviceRecord[]> {
  if (isDbConfigured()) {
    const db = getDb();
    const rows = await db.select().from(devices);
    return rows.map(fromRow).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return mockStore()
    .map(fromRow)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Exchanges a still-valid, unclaimed setup code for a fresh device token.
// The raw token is returned exactly once — only its hash is ever persisted —
// so the caller (the /api/kiosk/claim route) must set it as the device's
// cookie immediately and never log or echo it again.
export async function claimDevice(
  code: string
): Promise<{ deviceId: string; deviceName: string; token: string } | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const now = new Date();

  if (isDbConfigured()) {
    const db = getDb();
    const [row] = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.setupCode, normalized),
          isNull(devices.revokedAt),
          gt(devices.setupExpires, now)
        )
      );
    if (!row) return null;
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    await db
      .update(devices)
      .set({ tokenHash, setupCode: null, setupExpires: null, lastSeenAt: now })
      .where(eq(devices.id, row.id));
    return { deviceId: row.id, deviceName: row.name, token };
  }

  const row = mockStore().find(
    (r) => r.setupCode === normalized && !r.revokedAt && r.setupExpires && r.setupExpires > now
  );
  if (!row) return null;
  const token = randomToken();
  row.tokenHash = await sha256Hex(token);
  row.setupCode = null;
  row.setupExpires = null;
  row.lastSeenAt = now;
  return { deviceId: row.id, deviceName: row.name, token };
}

// Resolves a device's own cookie token back to its identity — null for an
// unrecognized, unclaimed, or revoked token (fails closed). Bumps
// last_seen_at so the admin devices list shows real activity.
export async function verifyDeviceToken(token: string): Promise<{ id: string; name: string } | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const now = new Date();

  if (isDbConfigured()) {
    const db = getDb();
    const [row] = await db
      .select()
      .from(devices)
      .where(and(eq(devices.tokenHash, tokenHash), isNull(devices.revokedAt)));
    if (!row) return null;
    await db.update(devices).set({ lastSeenAt: now }).where(eq(devices.id, row.id));
    return { id: row.id, name: row.name };
  }

  const row = mockStore().find((r) => r.tokenHash === tokenHash && !r.revokedAt);
  if (!row) return null;
  row.lastSeenAt = now;
  return { id: row.id, name: row.name };
}

export async function revokeDevice(id: string): Promise<void> {
  const now = new Date();
  if (isDbConfigured()) {
    const db = getDb();
    await db.update(devices).set({ revokedAt: now }).where(eq(devices.id, id));
    return;
  }
  const row = mockStore().find((r) => r.id === id);
  if (row) row.revokedAt = now;
}

// Permanently removes a device's row — only once it's already revoked, so
// there's no path straight from "still trusted" to "gone with no audit
// trail." Returns false (no-op) if the device doesn't exist or hasn't been
// revoked yet, so the caller can respond with a clear error instead of
// silently doing nothing.
export async function deleteDevice(id: string): Promise<boolean> {
  if (isDbConfigured()) {
    const db = getDb();
    const deleted = await db
      .delete(devices)
      .where(and(eq(devices.id, id), isNotNull(devices.revokedAt)))
      .returning({ id: devices.id });
    return deleted.length > 0;
  }
  const store = mockStore();
  const index = store.findIndex((r) => r.id === id && r.revokedAt);
  if (index === -1) return false;
  store.splice(index, 1);
  return true;
}

// --- Dual-auth actor resolution ---
// Every kiosk-scoped route calls this instead of reading the session
// directly: a signed-in user's session wins if present, otherwise a valid
// device cookie stands in for one. Returns null when neither is present or
// the device token doesn't resolve (revoked/unknown) — callers respond 401.

export type AttendanceActor =
  | { type: "user"; email: string; role: Role }
  | { type: "device"; id: string; name: string };

export async function getAttendanceActor(deviceToken: string | undefined): Promise<AttendanceActor | null> {
  // Deferred import: pulling next-auth in at module load time drags in
  // next/server, which isn't resolvable under vitest's plain Node
  // environment — this keeps lib/deviceAuth.test.ts able to exercise the
  // device-lifecycle functions without needing the whole Next.js runtime.
  const { auth } = await import("./auth");
  const session = await auth();
  if (session?.user?.email) {
    return { type: "user", email: session.user.email, role: session.user.role };
  }
  if (!deviceToken) return null;
  const device = await verifyDeviceToken(deviceToken);
  if (!device) return null;
  return { type: "device", id: device.id, name: device.name };
}

// Convenience wrapper every /api/kiosk/* route uses: pulls the device cookie
// off the request and resolves the actor in one call.
export async function getAttendanceActorFromRequest(request: NextRequest): Promise<AttendanceActor | null> {
  return getAttendanceActor(request.cookies.get(DEVICE_COOKIE_NAME)?.value);
}
