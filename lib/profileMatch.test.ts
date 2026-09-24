import { describe, expect, it } from "vitest";
import { profileMatchesName } from "./profileMatch";

const p = (first_name: string, last_name: string) => ({ first_name, last_name });

describe("profileMatchesName", () => {
  it("matches the same person, ignoring case, accents, and middle names", () => {
    expect(profileMatchesName(p("Steve", "Tolba"), "Steve Wagih Tolba")).toBe(true);
    expect(profileMatchesName(p("Steve Wagih", "Tolba"), "steve tolba")).toBe(true);
    expect(profileMatchesName(p("José", "Núñez"), "Jose Nunez")).toBe(true);
    expect(profileMatchesName(p("Anne-Marie", "O'Neil"), "Anne-Marie ONeil")).toBe(true);
  });
  it("ignores honorifics such as Fr.", () => {
    expect(profileMatchesName(p("Fr. Anthony", "Messeh"), "Anthony Messeh")).toBe(true);
    expect(profileMatchesName(p("Anthony", "Messeh"), "Fr. Anthony Messeh")).toBe(true);
  });
  it("rejects a child who shares a parent's email", () => {
    expect(profileMatchesName(p("Emily", "Tolba"), "Steve Wagih Tolba")).toBe(false);
    expect(profileMatchesName(p("Karen", "Tawadrous"), "Steve Wagih Tolba")).toBe(false);
  });
  it("requires the last name", () => {
    expect(profileMatchesName(p("Steve", "Tolba"), "Steve Smith")).toBe(false);
  });
  it("fails closed on a blank name but treats undefined as 'no name to check'", () => {
    expect(profileMatchesName(p("Steve", "Tolba"), "")).toBe(false);
    expect(profileMatchesName(p("Steve", "Tolba"), null)).toBe(false);
    expect(profileMatchesName(p("Steve", "Tolba"), undefined)).toBe(true);
  });
});
