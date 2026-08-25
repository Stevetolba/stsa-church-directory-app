// Which series a volunteer (including a Team Lead — ADR-0017's elevated
// volunteer permission, not a distinct Role) may view attendance reports
// for. Sunday School class volunteers/team leads need to see their own
// class's attendance; every other series (Liturgy, etc.) stays staff/admin
// only, same as before this existed.
//
// Pinned by real Subsplash repeating-event id, not matched by title — same
// reasoning as the Reports landing page's CURATED_SERIES (ADR-0021 /
// lib/attendanceImport.ts's findSeriesByTitle): Subsplash has had two
// distinct series both titled "Sunday School [Arlington]" at once, so a
// title match risks matching the wrong (possibly stale/retired) one.
export const SUNDAY_SCHOOL_SERIES_IDS: readonly string[] = [
  "cf945785-424e-4537-9026-97260f911a6e", // Sunday School [Arlington]
  "8afcd344-51e4-4cf2-8d77-2dbb67dd0ecc", // Sunday School [Leesburg]
];

export function isSundaySchoolSeriesId(seriesId: string): boolean {
  return SUNDAY_SCHOOL_SERIES_IDS.includes(seriesId);
}
