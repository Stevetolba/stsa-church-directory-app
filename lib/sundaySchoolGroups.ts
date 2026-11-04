// The Sunday School class bands (age/grade groupings) shared by the report
// page's Suggested Filters and the weekly Team Lead attendance email
// (ADR-0028), so the two can't drift apart. Pure and client-safe.
//
// Mirrors the bands in ChildrenPageClient.tsx's own SUGGESTED_FILTERS, minus
// the Campus dimension — a Sunday School report is already scoped to one
// campus via its series. Keep in sync with ChildrenPageClient.tsx if the
// ministry's groupings change. Grade values per lib/grades.ts (Pre-K=1 ... 12th=14).
import type { SuggestedFilter } from "@/components/SuggestedFilters";

export interface ReportPreset {
  gradeFrom?: number;
  gradeTo?: number;
  ageFrom?: number;
  ageTo?: number;
}

export const SUNDAY_SCHOOL_PRESETS_BY_CAMPUS: Record<"Arlington" | "Leesburg", SuggestedFilter<ReportPreset>[]> = {
  Arlington: [
    { label: "Tim's Tots (3–5 years)", preset: { ageFrom: 3, ageTo: 5 } },
    { label: "KATW (K–1st)", preset: { gradeFrom: 2, gradeTo: 3 } },
    { label: "KATW (2nd–3rd)", preset: { gradeFrom: 4, gradeTo: 5 } },
    { label: "KATW (4th–5th)", preset: { gradeFrom: 6, gradeTo: 7 } },
    { label: "Middle School (6th–8th)", preset: { gradeFrom: 8, gradeTo: 10 } },
    { label: "High School (9th–12th)", preset: { gradeFrom: 11, gradeTo: 14 } },
  ],
  Leesburg: [
    { label: "Tim's Tots (3–5 years)", preset: { ageFrom: 3, ageTo: 5 } },
    { label: "KATW (K–2nd)", preset: { gradeFrom: 2, gradeTo: 4 } },
    { label: "KATW (3rd–5th)", preset: { gradeFrom: 5, gradeTo: 7 } },
    { label: "Middle School (6th–8th)", preset: { gradeFrom: 8, gradeTo: 10 } },
    { label: "High School (9th–12th)", preset: { gradeFrom: 11, gradeTo: 14 } },
  ],
};
