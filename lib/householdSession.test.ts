import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, set: () => {} }) }));

import { HOUSEHOLD_SESSION_MINUTES, createHouseholdSessionToken, verifyHouseholdSessionToken } from "./householdSession";

const data = { profileId: "p1", householdId: "h1", email: "mom@example.org", name: "Mom Lee" };

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret";
});

describe("household session token", () => {
  it("round-trips", () => {
    const now = Date.now();
    const s = verifyHouseholdSessionToken(createHouseholdSessionToken(data, now), now + 1000);
    expect(s).toMatchObject(data);
    expect(s!.expiresAt).toBe(now + HOUSEHOLD_SESSION_MINUTES * 60_000);
  });

  it("expires", () => {
    const now = Date.now();
    const t = createHouseholdSessionToken(data, now);
    expect(verifyHouseholdSessionToken(t, now + HOUSEHOLD_SESSION_MINUTES * 60_000 + 1)).toBeNull();
  });

  it("rejects a tampered payload (e.g. a different household)", () => {
    const t = createHouseholdSessionToken(data);
    const [payload, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), householdId: "h2" })).toString("base64url");
    expect(verifyHouseholdSessionToken(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects a token signed with another secret, and garbage", () => {
    const t = createHouseholdSessionToken(data);
    process.env.AUTH_SECRET = "other";
    expect(verifyHouseholdSessionToken(t)).toBeNull();
    expect(verifyHouseholdSessionToken("nope")).toBeNull();
    expect(verifyHouseholdSessionToken(undefined)).toBeNull();
    expect(verifyHouseholdSessionToken("a.b.c")).toBeNull();
  });
});
