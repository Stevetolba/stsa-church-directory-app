import { afterEach, describe, expect, it, vi } from "vitest";
import { householdCookieSite } from "./householdSession";

afterEach(() => vi.unstubAllEnvs());

describe("household session cookie site attributes", () => {
  it("is SameSite=None; Secure in production so it works inside the Subsplash app", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(householdCookieSite()).toEqual({ secure: true, sameSite: "none" });
  });

  it("stays Lax and non-Secure on plain-http local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(householdCookieSite()).toEqual({ secure: false, sameSite: "lax" });
  });
});
