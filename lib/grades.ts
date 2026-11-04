// Subsplash's academic_grade.value is a continuous integer scale confirmed
// against the real org's data (Pre-K=1 through 12th=14; value = grade + 2
// for 1st-12th). Used to turn a From/To grade-level UI into a numeric
// range filter over Profile.academic_grade_value.
export const GRADE_LEVELS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Pre-K" },
  { value: 2, label: "Kindergarten" },
  { value: 3, label: "1st Grade" },
  { value: 4, label: "2nd Grade" },
  { value: 5, label: "3rd Grade" },
  { value: 6, label: "4th Grade" },
  { value: 7, label: "5th Grade" },
  { value: 8, label: "6th Grade" },
  { value: 9, label: "7th Grade" },
  { value: 10, label: "8th Grade" },
  { value: 11, label: "9th Grade" },
  { value: 12, label: "10th Grade" },
  { value: 13, label: "11th Grade" },
  { value: 14, label: "12th Grade" },
];

export const MIN_GRADE_VALUE = GRADE_LEVELS[0].value;
export const MAX_GRADE_VALUE = GRADE_LEVELS[GRADE_LEVELS.length - 1].value;

// Subsplash derives academic_grade from graduation_year, so a grade
// "correction" has to be written as a graduation year. A school year is
// treated as rolling over on August 1 (months are 0-based below), which
// matches how churches usually advance Sunday School classes; if Subsplash
// rolls over on another date the admin review screen still shows both the
// grade label and the year, so a mismatch is visible before anything is
// applied.
const SCHOOL_YEAR_ROLLOVER_MONTH = 7; // August

// The calendar year in which the current school year ends.
export function schoolYearEnd(now: Date = new Date()): number {
  return now.getFullYear() + (now.getMonth() >= SCHOOL_YEAR_ROLLOVER_MONTH ? 1 : 0);
}

// academic_grade.value (Pre-K=1 … 12th=14) -> graduation year, or undefined
// when the value isn't on the scale.
export function graduationYearForGradeValue(value: number, now: Date = new Date()): number | undefined {
  if (!Number.isInteger(value) || value < MIN_GRADE_VALUE || value > MAX_GRADE_VALUE) return undefined;
  const grade = value - 2; // Pre-K=-1, K=0, 1st=1 … 12th=12
  return schoolYearEnd(now) + (12 - grade);
}

// Inverse of the above; undefined when the year falls outside Pre-K…12th.
export function gradeValueForGraduationYear(year: number, now: Date = new Date()): number | undefined {
  if (!Number.isInteger(year)) return undefined;
  const value = 14 - (year - schoolYearEnd(now));
  return value >= MIN_GRADE_VALUE && value <= MAX_GRADE_VALUE ? value : undefined;
}

export function gradeLabelForValue(value: number | undefined): string | undefined {
  return GRADE_LEVELS.find((g) => g.value === value)?.label;
}
