// Weekly Sunday School attendance email to each campus's Team Leads
// (ADR-0028): who came last Sunday and how many Sundays this month, per class
// band (the report page's Suggested Filters). Pure logic here plus the
// orchestrator the daily cron route calls.

import { calculateAge } from "./age";
import { summarizeSeriesFrequency, listCheckIns, listCheckInsForSeries } from "./attendance";
import { claimReportSend, recordReportRecipients, releaseReportSend } from "./attendanceReportSends";
import { buildWeeklyAttendanceEmail } from "./attendanceReportEmail";
import { getFromAddress, sendEmailBatch } from "./email";
import { occurrenceDateInTz } from "./eventTime";
import { campusGroupFor, listOccurrences, listSeries } from "./events";
import { SUNDAY_SCHOOL_SERIES_BY_CAMPUS } from "./reportAccess";
import { SUNDAY_SCHOOL_PRESETS_BY_CAMPUS, type ReportPreset } from "./sundaySchoolGroups";
import { FULL_ROSTER_PAGE_SIZE, searchProfiles } from "./subsplash";
import { CHURCH_NAME } from "./trainingEmail";
import type { CheckInRecord } from "@/types/attendance";
import type { Campus, Profile } from "@/types/profile";

const TZ = "America/New_York";
const CAMPUSES: Campus[] = ["Arlington", "Leesburg"];

export interface ReportWeek {
  // The Sunday being reported, YYYY-MM-DD.
  sunday: string;
  // First day of that Sunday's month.
  monthFrom: string;
  // True from Wednesday 12:00 through Saturday (America/New_York).
  isSendWindow: boolean;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function reportWeekFor(now: Date): ReportWeek {
  const today = occurrenceDateInTz(now.toISOString(), TZ);
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const hour =
    Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now)) % 24;
  const sunday = addDays(today, -(weekday === 0 ? 7 : weekday));
  const isSendWindow = (weekday === 3 && hour >= 12) || weekday === 4 || weekday === 5 || weekday === 6;
  return { sunday, monthFrom: `${sunday.slice(0, 7)}-01`, isSendWindow };
}

export interface ReportPerson {
  profileId: string;
  displayName: string;
  grade: string | null;
  attendedDates: string[];
  cameLastSunday: boolean;
}

export interface ReportSection {
  label: string;
  people: ReportPerson[];
  cameLastSunday: number;
}

export interface CampusReport {
  sunday: string;
  // The month's Sundays up to and including `sunday`.
  occurrenceDates: string[];
  sections: ReportSection[];
}

function matchesPreset(profile: Profile | undefined, preset: ReportPreset, asOf: Date): boolean {
  if (!profile) return false;
  const gradeActive = preset.gradeFrom !== undefined || preset.gradeTo !== undefined;
  const ageActive = preset.ageFrom !== undefined || preset.ageTo !== undefined;
  if (gradeActive) {
    const g = profile.academic_grade_value;
    if (g === undefined) return false;
    if (preset.gradeFrom !== undefined && g < preset.gradeFrom) return false;
    if (preset.gradeTo !== undefined && g > preset.gradeTo) return false;
  }
  if (ageActive) {
    const age = profile.date_of_birth ? calculateAge(profile.date_of_birth, asOf) : null;
    if (age === null) return false;
    if (preset.ageFrom !== undefined && age < preset.ageFrom) return false;
    if (preset.ageTo !== undefined && age > preset.ageTo) return false;
  }
  return gradeActive || ageActive;
}

// `records` are the campus series' check-ins for the month up to `sunday`;
// `occurrenceDates` that month's Sundays up to `sunday`. Children only.
export function buildCampusReport(
  records: CheckInRecord[],
  occurrenceDates: string[],
  profilesById: Map<string, Profile>,
  presets: { label: string; preset: ReportPreset }[],
  sunday: string
): CampusReport {
  const [y, m, d] = sunday.split("-").map(Number);
  const asOf = new Date(y, m - 1, d);
  const freq = summarizeSeriesFrequency(records.filter((r) => r.isChild), occurrenceDates);
  const people: (ReportPerson & { profile?: Profile })[] = freq.people.map((p) => {
    const profile = profilesById.get(p.profileId);
    return {
      profileId: p.profileId,
      displayName: p.displayName,
      grade: profile?.academic_grade ?? null,
      attendedDates: p.attendedDates,
      cameLastSunday: p.attendedDates.includes(sunday),
      profile,
    };
  });
  const sortPeople = (list: ReportPerson[]) =>
    [...list].sort(
      (a, b) =>
        Number(b.cameLastSunday) - Number(a.cameLastSunday) ||
        b.attendedDates.length - a.attendedDates.length ||
        a.displayName.localeCompare(b.displayName)
    );
  const toSection = (label: string, list: ReportPerson[]): ReportSection => ({
    label,
    people: sortPeople(list),
    cameLastSunday: list.filter((p) => p.cameLastSunday).length,
  });
  const sections = presets.map((p) =>
    toSection(p.label, people.filter((x) => matchesPreset(x.profile, p.preset, asOf)))
  );
  sections.push(toSection("All Sunday School", people));
  return { sunday, occurrenceDates: freq.occurrenceDates, sections };
}

export type CampusStatus =
  | "sent"
  | "already sent"
  | "waiting for import"
  | "no class"
  | "no team leads"
  | "error";

export interface WeeklyReportResult {
  skipped?: string;
  sunday?: string;
  campuses: { campus: Campus; status: CampusStatus; recipients?: number; error?: string }[];
}

export function teamLeadsFor(campus: Campus, profiles: Profile[]): Profile[] {
  const seen = new Set<string>();
  return profiles.filter((p) => {
    if (p.directory_role !== "Team Lead" || p.campus !== campus || !p.email) return false;
    const key = p.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function runWeeklyAttendanceReports(
  appUrl: string,
  now = new Date(),
  opts: { force?: boolean; onlyTo?: string } = {}
): Promise<WeeklyReportResult> {
  const week = reportWeekFor(now);
  if (!week.isSendWindow && !opts.force) return { skipped: "outside send window", campuses: [] };

  const allSeries = await listSeries();
  const profiles = (await searchProfiles({ pageSize: FULL_ROSTER_PAGE_SIZE })).profiles;
  const profilesById = new Map(profiles.map((p) => [p.id, p]));
  const results: WeeklyReportResult["campuses"] = [];

  for (const campus of CAMPUSES) {
    try {
      // Real org: pinned Subsplash series id. Mock data uses different ids,
      // so fall back to a title match.
      const pinned = SUNDAY_SCHOOL_SERIES_BY_CAMPUS[campus];
      const series =
        allSeries.find((s) => s.seriesId === pinned) ??
        allSeries.find((s) => /sunday school/i.test(s.title) && campusGroupFor(s.title) === campus);
      if (!series) {
        results.push({ campus, status: "no class" });
        continue;
      }
      const seriesId = series.seriesId;
      const monthOccurrences = await listOccurrences(seriesId, { from: week.monthFrom, to: week.sunday });
      if (!monthOccurrences.some((o) => o.occurrence_date === week.sunday)) {
        results.push({ campus, status: "no class" });
        continue;
      }
      if ((await listCheckIns(seriesId, week.sunday)).length === 0) {
        results.push({ campus, status: "waiting for import" });
        continue;
      }
      const leads = teamLeadsFor(campus, profiles);
      if (opts.onlyTo === undefined && leads.length === 0) {
        results.push({ campus, status: "no team leads" });
        continue;
      }
      if (opts.onlyTo === undefined && !(await claimReportSend(campus, week.sunday))) {
        results.push({ campus, status: "already sent" });
        continue;
      }
      try {
        const records = await listCheckInsForSeries(seriesId, week.monthFrom, week.sunday);
        const report = buildCampusReport(
          records,
          monthOccurrences.map((o) => o.occurrence_date),
          profilesById,
          SUNDAY_SCHOOL_PRESETS_BY_CAMPUS[campus],
          week.sunday
        );
        const { subject, html } = buildWeeklyAttendanceEmail({
          campus,
          report,
          reportUrl: `${appUrl}/events/${encodeURIComponent(series.representativeEventId)}/report`,
          logoUrl: `${appUrl}/stsa-logo.png`,
        });
        const to = opts.onlyTo ? [opts.onlyTo] : leads.map((l) => l.email);
        const { failed } = await sendEmailBatch(
          to.map((email) => ({ to: email, subject, html })),
          { fromName: CHURCH_NAME, replyTo: getFromAddress() }
        );
        if (failed.length === to.length) throw new Error(failed[0]?.message ?? "send failed");
        if (opts.onlyTo === undefined) await recordReportRecipients(campus, week.sunday, to.length - failed.length);
        results.push({ campus, status: "sent", recipients: to.length - failed.length });
      } catch (err) {
        if (opts.onlyTo === undefined) await releaseReportSend(campus, week.sunday);
        throw err;
      }
    } catch (err) {
      results.push({ campus, status: "error", error: err instanceof Error ? err.message : "failed" });
    }
  }
  return { sunday: week.sunday, campuses: results };
}
