import { describe, expect, it } from "vitest";
import { buildCampusReport, reportWeekFor, teamLeadsFor } from "./weeklyAttendanceReport";
import { buildWeeklyAttendanceEmail } from "./attendanceReportEmail";
import { SUNDAY_SCHOOL_PRESETS_BY_CAMPUS } from "./sundaySchoolGroups";
import type { CheckInRecord } from "@/types/attendance";
import type { Profile } from "@/types/profile";

describe("reportWeekFor", () => {
  it("is outside the window before Wednesday noon ET", () => {
    // Wed 2026-11-04 11:59 EST = 16:59 UTC
    expect(reportWeekFor(new Date("2026-11-04T16:59:00Z")).isSendWindow).toBe(false);
    expect(reportWeekFor(new Date("2026-11-04T17:00:00Z")).isSendWindow).toBe(true);
  });
  it("covers Thursday–Saturday and excludes Sunday–Tuesday", () => {
    expect(reportWeekFor(new Date("2026-11-05T15:00:00Z")).isSendWindow).toBe(true);
    expect(reportWeekFor(new Date("2026-11-07T15:00:00Z")).isSendWindow).toBe(true);
    expect(reportWeekFor(new Date("2026-11-08T15:00:00Z")).isSendWindow).toBe(false);
    expect(reportWeekFor(new Date("2026-11-03T15:00:00Z")).isSendWindow).toBe(false);
  });
  it("reports the Sunday just past and its month (EDT week)", () => {
    // Wed 2026-10-07 noon EDT = 16:00 UTC
    const w = reportWeekFor(new Date("2026-10-07T16:00:00Z"));
    expect(w).toEqual({ sunday: "2026-10-04", monthFrom: "2026-10-01", isSendWindow: true });
  });
  it("uses the prior month when the Sunday is at month end", () => {
    const w = reportWeekFor(new Date("2026-12-02T17:00:00Z"));
    expect(w.sunday).toBe("2026-11-29");
    expect(w.monthFrom).toBe("2026-11-01");
  });
});

function rec(profileId: string, name: string, date: string, isChild = true): CheckInRecord {
  return { id: `${profileId}${date}`, seriesId: "s", eventId: "e", occurrenceDate: date, profileId, displayName: name, isChild, checkedInAt: "", checkedInBy: "x", method: "subsplash", isGuest: false };
}
const profile = (id: string, extra: Partial<Profile>): Profile =>
  ({ id, first_name: id, last_name: "", email: "", status: "Member", ...extra }) as Profile;

describe("buildCampusReport", () => {
  const dates = ["2026-11-01", "2026-11-08"];
  const sunday = "2026-11-08";
  const profiles = new Map<string, Profile>([
    ["a", profile("a", { academic_grade: "K", academic_grade_value: 2 })],
    ["b", profile("b", { academic_grade: "1st", academic_grade_value: 3 })],
    ["t", profile("t", { date_of_birth: "2022-01-01" })],
  ]);
  const records = [
    rec("a", "Ann", "2026-11-01"),
    rec("a", "Ann", "2026-11-08"),
    rec("b", "Ben", "2026-11-01"),
    rec("t", "Tot", "2026-11-08"),
    rec("p", "Parent", "2026-11-08", false),
  ];
  const report = buildCampusReport(records, dates, profiles, SUNDAY_SCHOOL_PRESETS_BY_CAMPUS.Arlington, sunday);
  const section = (label: string) => report.sections.find((s) => s.label.startsWith(label))!;

  it("buckets children by grade and age, excluding adults", () => {
    expect(section("KATW (K–1st)").people.map((p) => p.displayName)).toEqual(["Ann", "Ben"]);
    expect(section("Tim's Tots").people.map((p) => p.displayName)).toEqual(["Tot"]);
    expect(section("All Sunday School").people.map((p) => p.displayName)).toEqual(["Ann", "Tot", "Ben"]);
  });
  it("sorts last-Sunday attendees first and counts them", () => {
    expect(section("KATW (K–1st)").cameLastSunday).toBe(1);
    expect(section("All Sunday School").cameLastSunday).toBe(2);
    expect(section("KATW (K–1st)").people[0].attendedDates).toHaveLength(2);
  });
});

describe("teamLeadsFor", () => {
  it("keeps Team Leads at the campus with email, deduplicated", () => {
    const leads = teamLeadsFor("Arlington", [
      profile("1", { directory_role: "Team Lead", campus: "Arlington", email: "a@x.org" }),
      profile("2", { directory_role: "Team Lead", campus: "Arlington", email: "A@x.org" }),
      profile("3", { directory_role: "Team Lead", campus: "Leesburg", email: "b@x.org" }),
      profile("4", { directory_role: "Volunteer", campus: "Arlington", email: "c@x.org" }),
      profile("5", { directory_role: "Team Lead", campus: "Arlington", email: "" }),
    ]);
    expect(leads.map((l) => l.id)).toEqual(["1"]);
  });
});

describe("buildWeeklyAttendanceEmail", () => {
  it("escapes names and has one section per band plus All", () => {
    const report = buildCampusReport([rec("a", "<b>Ann</b>", "2026-11-08")], ["2026-11-08"], new Map(), SUNDAY_SCHOOL_PRESETS_BY_CAMPUS.Leesburg, "2026-11-08");
    const { subject, html } = buildWeeklyAttendanceEmail({ campus: "Leesburg", report, reportUrl: "https://x.test/r", logoUrl: "https://x.test/l.png" });
    expect(subject).toContain("1 came");
    expect(html).toContain("&lt;b&gt;Ann");
    expect(html).not.toContain("<b>Ann");
    expect((html.match(/<h3 /g) ?? []).length).toBe(6);
  });
});
