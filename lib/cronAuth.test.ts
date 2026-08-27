import { afterEach, describe, expect, it } from "vitest";
import { cronSecretMatches } from "./cronAuth";

describe("cronSecretMatches", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("is true when the bearer token matches CRON_SECRET", () => {
    process.env.CRON_SECRET = "the-real-secret";
    expect(cronSecretMatches("Bearer the-real-secret")).toBe(true);
  });

  it("is false when the token is wrong, missing, or malformed", () => {
    process.env.CRON_SECRET = "the-real-secret";
    expect(cronSecretMatches("Bearer wrong-secret")).toBe(false);
    expect(cronSecretMatches("Bearer")).toBe(false);
    expect(cronSecretMatches(null)).toBe(false);
    expect(cronSecretMatches("the-real-secret")).toBe(false); // missing "Bearer " scheme
  });

  it("is false when CRON_SECRET isn't configured, even with a matching-looking header", () => {
    delete process.env.CRON_SECRET;
    expect(cronSecretMatches("Bearer anything")).toBe(false);
  });
});
