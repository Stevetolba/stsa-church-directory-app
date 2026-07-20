import { describe, expect, it } from "vitest";
import { generateMatchCode, isValidMatchCode } from "./matchCode";

describe("generateMatchCode", () => {
  it("returns a 4-digit numeric string", () => {
    const code = generateMatchCode();
    expect(code).toMatch(/^\d{4}$/);
  });

  it("avoids a code already in the active set", () => {
    const active = new Set(["1234"]);
    for (let i = 0; i < 20; i++) {
      expect(generateMatchCode(active)).not.toBe("1234");
    }
  });

  it("still returns a well-formed code when the active set is exhausted", () => {
    const all = new Set<string>();
    for (let n = 1000; n <= 9999; n++) all.add(String(n));
    expect(generateMatchCode(all)).toMatch(/^\d{4}$/);
  });
});

describe("isValidMatchCode", () => {
  it("accepts exactly 4 digits", () => {
    expect(isValidMatchCode("0123")).toBe(true);
    expect(isValidMatchCode("9999")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidMatchCode("123")).toBe(false);
    expect(isValidMatchCode("12345")).toBe(false);
    expect(isValidMatchCode("12a4")).toBe(false);
    expect(isValidMatchCode("")).toBe(false);
  });
});
