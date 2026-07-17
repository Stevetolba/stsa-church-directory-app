import type { Profile } from "@/types/profile";
import type { Household } from "@/types/household";
import type { AppEvent, EventSession } from "@/types/event";
import type { CheckInRecord } from "@/types/attendance";
import { occurrenceDateInTz } from "./eventTime";

// Mock fixtures — Step 3 build order: "mock responses until credentials
// arrive". Extends the design mockup's 9 sample members with the full
// Profile shape, one household per member (plus one two-member household
// to exercise the "other household members" list), and all five
// MemberStatus values represented (ADR-0006). Arlington and Leesburg are
// both real Northern Virginia towns, so addresses use VA.

// Stored on globalThis rather than as plain module-level consts: Next.js's
// dev server compiles Route Handlers and Server Components as separate
// module layers, so a plain array here would be a *different* array in
// each — mutations from updateProfile() (called from the API route) would
// be invisible to pages reading it back. globalThis is a true singleton
// across all layers within the same process (the same reasoning as the
// standard Next.js Prisma-client-singleton pattern for surviving Fast
// Refresh). Irrelevant once wired to the real API — a real HTTP call has
// no such problem.
declare global {
  // eslint-disable-next-line no-var
  var __mockHouseholds: Household[] | undefined;
  // eslint-disable-next-line no-var
  var __mockProfiles: Profile[] | undefined;
  // eslint-disable-next-line no-var
  var __mockEvents: AppEvent[] | undefined;
  // eslint-disable-next-line no-var
  var __mockCheckIns: CheckInRecord[] | undefined;
}

const SEED_HOUSEHOLDS: Household[] = [
  {
    id: "household-whitfield",
    name: "Whitfield Family",
    primary_email: "margaret.whitfield@gracechapel.org",
    primary_phone: "(614) 555-0142",
    address: "142 Maple Street, Arlington, VA 22201",
    status: "active",
    created_at: "2019-03-11T14:00:00Z",
    updated_at: "2025-11-02T09:30:00Z",
  },
  {
    id: "household-okafor",
    name: "Okafor Household",
    primary_email: "d.okafor@gracechapel.org",
    primary_phone: "(614) 555-0198",
    address: "88 Cardinal Lane, Leesburg, VA 20175",
    status: "active",
    created_at: "2020-06-04T14:00:00Z",
    updated_at: "2025-10-18T09:30:00Z",
  },
  {
    id: "household-anand",
    name: "Anand Family",
    primary_email: "priya.anand@gmail.com",
    primary_phone: "(614) 555-0173",
    address: "27 Birchwood Court, Arlington, VA 22203",
    status: "active",
    created_at: "2021-01-22T14:00:00Z",
    updated_at: "2025-09-30T09:30:00Z",
  },
  {
    id: "household-reyes",
    name: "Reyes Household",
    primary_email: "treyes88@outlook.com",
    primary_phone: "(614) 555-0110",
    address: "510 Harrison Ave, Leesburg, VA 20176",
    status: "active",
    created_at: "2024-12-01T14:00:00Z",
    updated_at: "2025-12-01T09:30:00Z",
  },
  {
    id: "household-carter",
    name: "Carter Family",
    primary_email: "evelyn.carter@gracechapel.org",
    primary_phone: "(614) 555-0161",
    address: "9 Fairview Terrace, Arlington, VA 22204",
    status: "active",
    created_at: "2017-08-19T14:00:00Z",
    updated_at: "2025-11-20T09:30:00Z",
  },
  {
    id: "household-sutton",
    name: "Sutton Household",
    primary_email: "j.sutton@yahoo.com",
    primary_phone: "(614) 555-0129",
    address: "233 King Street, Leesburg, VA 20175",
    status: "active",
    created_at: "2026-02-09T14:00:00Z",
    updated_at: "2026-02-09T09:30:00Z",
  },
  {
    id: "household-morales",
    name: "Morales Family",
    primary_email: "ana.morales@gmail.com",
    primary_phone: "(614) 555-0184",
    address: "76 Wilson Blvd, Arlington, VA 22201",
    status: "active",
    created_at: "2025-05-14T14:00:00Z",
    updated_at: "2025-12-15T09:30:00Z",
  },
  {
    id: "household-bishop",
    name: "Bishop Household",
    primary_email: "h.bishop@gracechapel.org",
    primary_phone: "(614) 555-0155",
    address: "14 Loudoun St, Leesburg, VA 20176",
    status: "active",
    created_at: "2015-04-02T14:00:00Z",
    updated_at: "2024-06-10T09:30:00Z",
  },
  {
    id: "household-fields",
    name: "Fields Family",
    primary_email: "naomi.fields@gmail.com",
    primary_phone: "(614) 555-0137",
    address: "301 Clarendon Blvd, Arlington, VA 22203",
    status: "active",
    created_at: "2022-09-27T14:00:00Z",
    updated_at: "2025-08-05T09:30:00Z",
  },
];

const SEED_PROFILES: Profile[] = [
  {
    id: "profile-margaret-whitfield",
    first_name: "Margaret",
    last_name: "Whitfield",
    email: "margaret.whitfield@gracechapel.org",
    phone_number: "(614) 555-0142",
    date_of_birth: "1968-04-12",
    gender: "female",
    marital_status: "married",
    household_id: "household-whitfield",
    household_name: "Whitfield Family",
    household_role: "parent",
    status: "Member",
    campus: "Arlington",
    baptism_date: "1985-06-02",
    // allergy_notes applies to any profile (not just children); no care_notes
    // here so the adult-vs-child rendering (Care shown only for children) is
    // exercisable in mock mode — ADR-0012.
    allergy_notes: "Latex allergy.",
    // Directory access flags this person as an approved read-only volunteer
    // (ADR-0010) — lets the volunteer sign-in path be exercised in mock mode.
    // Field label matches this project's configured
    // SUBSPLASH_ACCESS_FIELD_NAME (.env.local), not the code's fallback default.
    custom_fields: [
      { id: "cf-campus", label: "Campus", value: "Arlington" },
      { id: "cf-access", label: "DirectoryAccess", value: "Yes" },
    ],
    created_at: "2019-03-11T14:00:00Z",
    updated_at: "2025-11-02T09:30:00Z",
  },
  {
    id: "profile-robert-whitfield",
    first_name: "Robert",
    last_name: "Whitfield",
    email: "robert.whitfield@gracechapel.org",
    phone_number: "(614) 555-0143",
    date_of_birth: "1966-09-21",
    gender: "male",
    marital_status: "married",
    household_id: "household-whitfield",
    household_name: "Whitfield Family",
    household_role: "parent",
    status: "Member",
    campus: "Arlington",
    baptism_date: "1983-05-15",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Arlington" }],
    created_at: "2019-03-11T14:00:00Z",
    updated_at: "2025-11-02T09:30:00Z",
  },
  {
    id: "profile-lily-whitfield",
    first_name: "Lily",
    last_name: "Whitfield",
    email: "lily.whitfield@gracechapel.org",
    date_of_birth: "2016-03-08",
    gender: "female",
    household_id: "household-whitfield",
    household_name: "Whitfield Family",
    household_role: "child",
    // academic_grade is normally computed server-side by Subsplash from
    // graduation_year — hardcoded here as a mock stand-in for that.
    // academic_grade_value follows Subsplash's real ordinal scale
    // (lib/grades.ts): 5th Grade = 7.
    graduation_year: 2034,
    academic_grade: "5th Grade",
    academic_grade_value: 7,
    status: "Member",
    campus: "Arlington",
    baptism_date: "2016-08-21",
    // Safety fields (ADR-0012) — care_notes is child-only + "private".
    allergy_notes: "Severe peanut allergy — carries an EpiPen.",
    care_notes: "Needs quiet space if overstimulated. Pickup by parent or grandmother only.",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Arlington" }],
    created_at: "2019-03-11T14:00:00Z",
    updated_at: "2025-11-02T09:30:00Z",
  },
  {
    id: "profile-daniel-okafor",
    first_name: "Daniel",
    last_name: "Okafor",
    email: "d.okafor@gracechapel.org",
    phone_number: "(614) 555-0198",
    date_of_birth: "1979-11-03",
    gender: "male",
    marital_status: "married",
    household_id: "household-okafor",
    household_name: "Okafor Household",
    household_role: "guardian",
    status: "Member",
    campus: "Leesburg",
    baptism_date: "2001-09-16",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Leesburg" }],
    created_at: "2020-06-04T14:00:00Z",
    updated_at: "2025-10-18T09:30:00Z",
  },
  {
    id: "profile-priya-anand",
    first_name: "Priya",
    last_name: "Anand",
    email: "priya.anand@gmail.com",
    phone_number: "(614) 555-0173",
    date_of_birth: "1990-02-27",
    gender: "female",
    marital_status: "single",
    household_id: "household-anand",
    household_name: "Anand Family",
    household_role: "guardian",
    status: "Regular Attendee",
    campus: "Arlington",
    // Personal gmail address + directory access: exercises the volunteer
    // sign-in path (ADR-0010) against mock data — Priya isn't on the church
    // Workspace domain but is an approved volunteer. Field label matches
    // this project's configured SUBSPLASH_ACCESS_FIELD_NAME (.env.local),
    // not necessarily the code's fallback default.
    custom_fields: [
      { id: "cf-campus", label: "Campus", value: "Arlington" },
      { id: "cf-directory-access", label: "DirectoryAccess", value: "Yes" },
    ],
    created_at: "2021-01-22T14:00:00Z",
    updated_at: "2025-09-30T09:30:00Z",
  },
  {
    id: "profile-thomas-reyes",
    first_name: "Thomas",
    last_name: "Reyes",
    email: "treyes88@outlook.com",
    phone_number: "(614) 555-0110",
    date_of_birth: "1988-07-19",
    gender: "male",
    household_id: "household-reyes",
    household_name: "Reyes Household",
    household_role: "guardian",
    status: "Visitor",
    campus: "Leesburg",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Leesburg" }],
    created_at: "2024-12-01T14:00:00Z",
    updated_at: "2025-12-01T09:30:00Z",
  },
  {
    id: "profile-evelyn-carter",
    first_name: "Evelyn",
    last_name: "Carter",
    email: "evelyn.carter@gracechapel.org",
    phone_number: "(614) 555-0161",
    date_of_birth: "1957-01-30",
    gender: "female",
    marital_status: "widowed",
    household_id: "household-carter",
    household_name: "Carter Family",
    household_role: "guardian",
    status: "Member",
    campus: "Arlington",
    baptism_date: "1973-04-08",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Arlington" }],
    created_at: "2017-08-19T14:00:00Z",
    updated_at: "2025-11-20T09:30:00Z",
  },
  {
    id: "profile-james-sutton",
    first_name: "James",
    last_name: "Sutton",
    email: "j.sutton@yahoo.com",
    phone_number: "(614) 555-0129",
    date_of_birth: "1995-09-05",
    gender: "male",
    household_id: "household-sutton",
    household_name: "Sutton Household",
    household_role: "guardian",
    status: "Newcomer",
    campus: "Leesburg",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Leesburg" }],
    created_at: "2026-02-09T14:00:00Z",
    updated_at: "2026-02-09T09:30:00Z",
  },
  {
    id: "profile-ana-morales",
    first_name: "Ana",
    last_name: "Morales",
    email: "ana.morales@gmail.com",
    phone_number: "(614) 555-0184",
    date_of_birth: "2001-12-14",
    gender: "female",
    marital_status: "single",
    household_id: "household-morales",
    household_name: "Morales Family",
    household_role: "guardian",
    status: "Visitor",
    campus: "Arlington",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Arlington" }],
    created_at: "2025-05-14T14:00:00Z",
    updated_at: "2025-12-15T09:30:00Z",
  },
  {
    id: "profile-harold-bishop",
    first_name: "Harold",
    last_name: "Bishop",
    email: "h.bishop@gracechapel.org",
    phone_number: "(614) 555-0155",
    date_of_birth: "1949-05-22",
    gender: "male",
    marital_status: "widowed",
    household_id: "household-bishop",
    household_name: "Bishop Household",
    household_role: "guardian",
    status: "Former Attender",
    campus: "Leesburg",
    baptism_date: "1966-08-14",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Leesburg" }],
    created_at: "2015-04-02T14:00:00Z",
    updated_at: "2024-06-10T09:30:00Z",
  },
  {
    id: "profile-naomi-fields",
    first_name: "Naomi",
    last_name: "Fields",
    email: "naomi.fields@gmail.com",
    phone_number: "(614) 555-0137",
    date_of_birth: "1993-10-08",
    gender: "female",
    marital_status: "married",
    household_id: "household-fields",
    household_name: "Fields Family",
    household_role: "guardian",
    status: "Regular Attendee",
    campus: "Arlington",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Arlington" }],
    created_at: "2022-09-27T14:00:00Z",
    updated_at: "2025-08-05T09:30:00Z",
  },
  // Additional children across both campuses and grade bands so the Sunday
  // School session mapping (Pre-K / Grades 1–5 / Youth) and the attendance
  // reports have more than one child to reason over.
  {
    id: "profile-grace-okafor",
    first_name: "Grace",
    last_name: "Okafor",
    email: "",
    date_of_birth: "2018-05-19",
    gender: "female",
    household_id: "household-okafor",
    household_name: "Okafor Household",
    household_role: "child",
    graduation_year: 2036,
    academic_grade: "3rd Grade",
    academic_grade_value: 5,
    status: "Member",
    campus: "Leesburg",
    allergy_notes: "Dairy intolerance.",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Leesburg" }],
    created_at: "2020-06-04T14:00:00Z",
    updated_at: "2025-10-18T09:30:00Z",
  },
  {
    id: "profile-rohan-anand",
    first_name: "Rohan",
    last_name: "Anand",
    email: "",
    date_of_birth: "2021-11-02",
    gender: "male",
    household_id: "household-anand",
    household_name: "Anand Family",
    household_role: "child",
    graduation_year: 2039,
    academic_grade: "Pre-K",
    academic_grade_value: 1,
    status: "Regular Attendee",
    campus: "Arlington",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Arlington" }],
    created_at: "2021-01-22T14:00:00Z",
    updated_at: "2025-09-30T09:30:00Z",
  },
  {
    id: "profile-mia-reyes",
    first_name: "Mia",
    last_name: "Reyes",
    email: "",
    date_of_birth: "2012-02-14",
    gender: "female",
    household_id: "household-reyes",
    household_name: "Reyes Household",
    household_role: "child",
    graduation_year: 2030,
    academic_grade: "8th Grade",
    academic_grade_value: 10,
    status: "Visitor",
    campus: "Leesburg",
    care_notes: "Pickup by parent only.",
    custom_fields: [{ id: "cf-campus", label: "Campus", value: "Leesburg" }],
    created_at: "2024-12-01T14:00:00Z",
    updated_at: "2025-12-01T09:30:00Z",
  },
];

export const mockHouseholds = globalThis.__mockHouseholds ?? (globalThis.__mockHouseholds = SEED_HOUSEHOLDS);
export const mockProfiles = globalThis.__mockProfiles ?? (globalThis.__mockProfiles = SEED_PROFILES);

// --- Mock events + seeded check-ins (ADR-0015) ---
//
// Generated relative to "now" so the app always has today's events, an open
// check-in window, and a realistic recurring-attendance history to demo
// reports/absentees — without any DB. All Sunday occurrences fall within ~10
// weeks of today, which for 2026 is entirely EDT (UTC-04:00), so a fixed
// offset keeps the mock timestamps simple and correct for the seeded window.

const MOCK_TZ = "America/New_York";
const EDT_OFFSET = "-04:00";

// type values mirror the live org exactly (confirmed: only "child" | "adult"
// | "everyone" occur) — a single "everyone" session exercises the
// hide-the-dropdown-and-drop-campus-filter path, and all-"child" sessions
// exercise the auto children-only roster restriction.
const LITURGY_SESSIONS: EventSession[] = [{ id: "liturgy-general", name: "General", type: "everyone" }];
// suggestionType/minGrade/maxGrade/minAgeMonths/maxAgeMonths mirror the real
// "Sunday School [Leesburg]" sessions (confirmed live) — Pre-K is age-based
// (with the real org's stray minGrade left on it too), the rest are
// grade-based on the same scale as Profile.academic_grade_value.
const SUNDAY_SCHOOL_SESSIONS: EventSession[] = [
  { id: "ss-prek", name: "Pre-K", type: "child", suggestionType: "age", minGrade: 1, minAgeMonths: 36, maxAgeMonths: 71 },
  { id: "ss-1-5", name: "Grades 1–5", type: "child", suggestionType: "grade", minGrade: 3, maxGrade: 7 },
  { id: "ss-youth", name: "Youth (6–12)", type: "child", suggestionType: "grade", minGrade: 8, maxGrade: 14 },
];

interface MockSeriesDef {
  seriesId: string;
  title: string;
  campus: "Arlington" | "Leesburg";
  startTime: string; // "HH:MM"
  endTime: string;
  sessions: EventSession[];
}

const MOCK_SERIES: MockSeriesDef[] = [
  { seriesId: "series-liturgy-arlington", title: "Divine Liturgy — Arlington", campus: "Arlington", startTime: "09:00", endTime: "10:30", sessions: LITURGY_SESSIONS },
  { seriesId: "series-ss-arlington", title: "Sunday School — Arlington", campus: "Arlington", startTime: "10:45", endTime: "11:45", sessions: SUNDAY_SCHOOL_SESSIONS },
  { seriesId: "series-liturgy-leesburg", title: "Divine Liturgy — Leesburg", campus: "Leesburg", startTime: "09:00", endTime: "10:30", sessions: LITURGY_SESSIONS },
  { seriesId: "series-ss-leesburg", title: "Sunday School — Leesburg", campus: "Leesburg", startTime: "10:45", endTime: "11:45", sessions: SUNDAY_SCHOOL_SESSIONS },
];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Most recent Sunday on or before the reference date (local wall-clock).
function sundayOnOrBefore(ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  d.setDate(d.getDate() - d.getDay()); // getDay() 0 = Sunday
  return d;
}

function buildMockEvents(now: Date): AppEvent[] {
  const events: AppEvent[] = [];
  const refSunday = sundayOnOrBefore(now);

  // 10 weekly occurrences per series: 8 past, the current week's Sunday, and
  // one upcoming — enough history for a month/year frequency report.
  for (const series of MOCK_SERIES) {
    for (let weekOffset = -8; weekOffset <= 1; weekOffset++) {
      const date = new Date(refSunday);
      date.setDate(date.getDate() + weekOffset * 7);
      const dateStr = ymd(date);
      const start = `${dateStr}T${series.startTime}:00${EDT_OFFSET}`;
      const end = `${dateStr}T${series.endTime}:00${EDT_OFFSET}`;
      events.push({
        id: `${series.seriesId}-${dateStr.replace(/-/g, "")}`,
        series_id: series.seriesId,
        title: series.title,
        start_at: start,
        end_at: end,
        timezone: MOCK_TZ,
        all_day: false,
        occurrence_date: occurrenceDateInTz(start, MOCK_TZ),
        source: "repeating",
        status: "published",
        check_in_enabled: true,
        sessions: series.sessions,
      });
    }
  }

  // A one-off event happening today, ~30 min from now, so the check-in window
  // and the "today" view are exercisable no matter what weekday it is.
  const liveStart = new Date(now.getTime() + 30 * 60 * 1000);
  const liveEnd = new Date(now.getTime() + 120 * 60 * 1000);
  events.push({
    id: "event-midweek-today",
    series_id: "event-midweek-today",
    title: "Midweek Bible Study — Arlington",
    start_at: liveStart.toISOString(),
    end_at: liveEnd.toISOString(),
    timezone: MOCK_TZ,
    all_day: false,
    occurrence_date: occurrenceDateInTz(liveStart.toISOString(), MOCK_TZ),
    source: "standard",
    status: "published",
    check_in_enabled: true,
    // A single adult-type session — exercises the auto adults-only roster
    // restriction alongside the hide-the-dropdown, single-session path.
    sessions: [{ id: "bible-study-adults", name: "Adults", type: "adult" }],
  });

  // A draft event (unpublished) to verify status filtering.
  const draftStart = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  events.push({
    id: "event-draft-retreat",
    series_id: "event-draft-retreat",
    title: "Parish Retreat (planning)",
    start_at: draftStart.toISOString(),
    end_at: new Date(draftStart.getTime() + 6 * 60 * 60 * 1000).toISOString(),
    timezone: MOCK_TZ,
    all_day: false,
    occurrence_date: occurrenceDateInTz(draftStart.toISOString(), MOCK_TZ),
    source: "standard",
    status: "draft",
    check_in_enabled: false,
    sessions: [],
  });

  return events;
}

// Seed check-ins across the past Sunday occurrences with varying per-person
// frequency, so reports show regulars vs. fading attendees and absentee views
// have data. Only attaches to occurrences strictly before today.
function buildMockCheckIns(events: AppEvent[], now: Date): CheckInRecord[] {
  const todayStr = occurrenceDateInTz(now.toISOString(), MOCK_TZ);
  const rows: CheckInRecord[] = [];
  let seq = 0;

  // profileId -> { seriesId, sessionId, sessionName, attendEvery }
  // attendEvery: attends every Nth past occurrence (1 = every week).
  const plans: Array<{
    profileId: string;
    displayName: string;
    isChild: boolean;
    seriesId: string;
    sessionId: string | null;
    sessionName: string | null;
    attendEvery: number;
  }> = [
    // Arlington Sunday School regulars
    { profileId: "profile-lily-whitfield", displayName: "Lily Whitfield", isChild: true, seriesId: "series-ss-arlington", sessionId: "ss-1-5", sessionName: "Grades 1–5", attendEvery: 1 },
    { profileId: "profile-rohan-anand", displayName: "Rohan Anand", isChild: true, seriesId: "series-ss-arlington", sessionId: "ss-prek", sessionName: "Pre-K", attendEvery: 2 },
    // Arlington Liturgy — adults
    { profileId: "profile-margaret-whitfield", displayName: "Margaret Whitfield", isChild: false, seriesId: "series-liturgy-arlington", sessionId: "liturgy-general", sessionName: "General", attendEvery: 1 },
    { profileId: "profile-priya-anand", displayName: "Priya Anand", isChild: false, seriesId: "series-liturgy-arlington", sessionId: "liturgy-general", sessionName: "General", attendEvery: 3 },
    // Leesburg Sunday School — one regular, one fading attendee
    { profileId: "profile-grace-okafor", displayName: "Grace Okafor", isChild: true, seriesId: "series-ss-leesburg", sessionId: "ss-1-5", sessionName: "Grades 1–5", attendEvery: 1 },
    { profileId: "profile-mia-reyes", displayName: "Mia Reyes", isChild: true, seriesId: "series-ss-leesburg", sessionId: "ss-youth", sessionName: "Youth (6–12)", attendEvery: 4 },
  ];

  // Past occurrences per series, oldest first, indexed for the attendEvery cadence.
  const pastBySeries = new Map<string, AppEvent[]>();
  for (const ev of events) {
    if (ev.occurrence_date >= todayStr) continue;
    const list = pastBySeries.get(ev.series_id) ?? [];
    list.push(ev);
    pastBySeries.set(ev.series_id, list);
  }
  for (const list of Array.from(pastBySeries.values())) {
    list.sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date));
  }

  for (const plan of plans) {
    const occurrences = pastBySeries.get(plan.seriesId) ?? [];
    occurrences.forEach((ev, i) => {
      if (i % plan.attendEvery !== 0) return;
      // Checked in ~5 min after start; checked out ~5 min after end.
      const checkedInAt = new Date(new Date(ev.start_at).getTime() + 5 * 60 * 1000).toISOString();
      const checkedOutAt = ev.end_at
        ? new Date(new Date(ev.end_at).getTime() + 5 * 60 * 1000).toISOString()
        : null;
      rows.push({
        id: `mock-checkin-${seq++}`,
        seriesId: ev.series_id,
        eventId: ev.id,
        occurrenceDate: ev.occurrence_date,
        profileId: plan.profileId,
        displayName: plan.displayName,
        isChild: plan.isChild,
        sessionId: plan.sessionId,
        sessionName: plan.sessionName,
        checkedInAt,
        checkedInBy: "office@gracechapel.org",
        checkedOutAt,
        checkedOutBy: checkedOutAt ? "office@gracechapel.org" : null,
        method: "live",
        isGuest: false,
      });
    });
  }

  return rows;
}

const SEED_EVENTS = buildMockEvents(new Date());
const SEED_CHECK_INS = buildMockCheckIns(SEED_EVENTS, new Date());

export const mockEvents = globalThis.__mockEvents ?? (globalThis.__mockEvents = SEED_EVENTS);
// Note: lib/attendance.ts reads/writes globalThis.__mockCheckIns directly; this
// export just performs the one-time seed.
export const mockCheckIns =
  globalThis.__mockCheckIns ?? (globalThis.__mockCheckIns = SEED_CHECK_INS);
