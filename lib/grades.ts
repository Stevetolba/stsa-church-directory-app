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
