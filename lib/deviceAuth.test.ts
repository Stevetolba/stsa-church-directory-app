import { beforeEach, describe, expect, it } from "vitest";
import {
  claimDevice,
  createDeviceSetupCode,
  listDevices,
  revokeDevice,
  verifyDeviceToken,
} from "./deviceAuth";

// No DATABASE_URL in the test environment, so these exercise the in-memory
// mock store — reset between tests since it lives on globalThis.
beforeEach(() => {
  globalThis.__mockDevices = [];
});

describe("device setup + claim lifecycle", () => {
  it("issues a 6-character setup code that a claim can redeem for a token", async () => {
    const device = await createDeviceSetupCode("Lobby iPad", "admin@example.org");
    expect(device.setupCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(device.claimed).toBe(false);

    const claimed = await claimDevice(device.setupCode!);
    expect(claimed).not.toBeNull();
    expect(claimed!.deviceId).toBe(device.id);
    expect(claimed!.deviceName).toBe("Lobby iPad");
    expect(claimed!.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is case-insensitive and trims whitespace on the code", async () => {
    const device = await createDeviceSetupCode("Lobby iPad", "admin@example.org");
    const claimed = await claimDevice(`  ${device.setupCode!.toLowerCase()}  `);
    expect(claimed).not.toBeNull();
  });

  it("a claimed code cannot be reused (single-use)", async () => {
    const device = await createDeviceSetupCode("Lobby iPad", "admin@example.org");
    const first = await claimDevice(device.setupCode!);
    expect(first).not.toBeNull();
    const second = await claimDevice(device.setupCode!);
    expect(second).toBeNull();
  });

  it("rejects an unknown code", async () => {
    await createDeviceSetupCode("Lobby iPad", "admin@example.org");
    expect(await claimDevice("ZZZZZZ")).toBeNull();
  });

  it("the claimed token verifies back to the device identity", async () => {
    const device = await createDeviceSetupCode("Lobby iPad", "admin@example.org");
    const claimed = await claimDevice(device.setupCode!);
    const verified = await verifyDeviceToken(claimed!.token);
    expect(verified).toEqual({ id: device.id, name: "Lobby iPad" });
  });

  it("rejects a garbage token", async () => {
    expect(await verifyDeviceToken("not-a-real-token")).toBeNull();
  });

  it("a revoked device's token no longer verifies", async () => {
    const device = await createDeviceSetupCode("Lobby iPad", "admin@example.org");
    const claimed = await claimDevice(device.setupCode!);
    await revokeDevice(device.id);
    expect(await verifyDeviceToken(claimed!.token)).toBeNull();
  });

  it("listDevices reflects claimed/unclaimed state", async () => {
    await createDeviceSetupCode("Lobby iPad", "admin@example.org");
    const b = await createDeviceSetupCode("Nursery iPad", "admin@example.org");
    await claimDevice(b.setupCode!);

    const all = await listDevices();
    expect(all).toHaveLength(2);
    expect(all.find((d) => d.name === "Lobby iPad")?.claimed).toBe(false);
    expect(all.find((d) => d.name === "Nursery iPad")?.claimed).toBe(true);
  });
});
