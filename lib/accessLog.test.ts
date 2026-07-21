import { beforeEach, describe, expect, it } from "vitest";
import { listAccessEvents, recordAccessEvent } from "./accessLog";

// DATABASE_URL is unset in the test env, so these exercise the in-memory
// mock-mode path (isDbConfigured() === false) — same convention as
// lib/attendance.ts's dual-path functions.
describe("accessLog (mock mode)", () => {
  beforeEach(() => {
    globalThis.__mockAccessEvents = [];
  });

  it("records and lists events, most recent first", async () => {
    await recordAccessEvent({ email: "staff@example.org", role: "staff", eventType: "sign_in" });
    await recordAccessEvent({
      email: "staff@example.org",
      role: "staff",
      eventType: "directory_read",
      resource: "profiles",
    });

    const events = await listAccessEvents();
    expect(events).toHaveLength(2);
    // Most recent insert first.
    expect(events[0]).toMatchObject({
      email: "staff@example.org",
      eventType: "directory_read",
      resource: "profiles",
    });
    expect(events[1]).toMatchObject({ eventType: "sign_in", resource: null });
  });

  it("defaults resource to null for sign-in events", async () => {
    await recordAccessEvent({ email: "a@example.org", role: "admin", eventType: "sign_in" });
    const [event] = await listAccessEvents();
    expect(event.resource).toBeNull();
  });

  it("logs a denied sign-in distinctly from a granted one", async () => {
    await recordAccessEvent({ email: "v@gmail.com", role: "volunteer", eventType: "sign_in_denied" });
    const [event] = await listAccessEvents();
    expect(event.eventType).toBe("sign_in_denied");
  });

  it("caps the returned list at the requested limit", async () => {
    for (let i = 0; i < 5; i++) {
      await recordAccessEvent({ email: `p${i}@example.org`, role: "staff", eventType: "sign_in" });
    }
    const events = await listAccessEvents(3);
    expect(events).toHaveLength(3);
  });

  it("treats a negative limit as zero rather than a negative slice", async () => {
    await recordAccessEvent({ email: "a@example.org", role: "admin", eventType: "sign_in" });
    const events = await listAccessEvents(-1);
    expect(events).toHaveLength(0);
  });
});
