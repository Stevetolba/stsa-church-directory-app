import { describe, expect, it } from "vitest";
import { churchToday } from "./churchTime";
import { groupProfilesByUpcomingBirthday } from "./birthdays";

const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()].join("-");

describe("churchToday", () => {
  it("is still the same day at 8:30 PM Eastern, when UTC is already tomorrow", () => {
    expect(ymd(churchToday(new Date("2026-11-07T01:30:00Z")))).toBe("2026-11-6");
  });

  it("follows daylight saving (EDT in summer)", () => {
    expect(ymd(churchToday(new Date("2026-07-05T02:00:00Z")))).toBe("2026-7-4");
  });

  it("rolls to the next day after midnight Eastern", () => {
    expect(ymd(churchToday(new Date("2026-11-07T05:30:00Z")))).toBe("2026-11-7");
  });

  it("keeps a birthday on its own day through the evening", () => {
    const profiles = [
      { id: "a", first_name: "A", last_name: "A", email: "", date_of_birth: "2016-11-06" },
      { id: "b", first_name: "B", last_name: "B", email: "", date_of_birth: "2016-11-07" },
    ] as never;
    const groups = groupProfilesByUpcomingBirthday(profiles, churchToday(new Date("2026-11-07T01:30:00Z")));
    expect(groups[0].label).toBe("Today");
    expect(groups[0].entries[0].profile.id).toBe("a");
    expect(groups[1].label).toBe("Tomorrow");
  });
});
