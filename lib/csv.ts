import type { Profile } from "@/types/profile";

// Minimal CSV encoder — no dependency needed for the flat, string-only rows
// this app exports. RFC 4180: quote a field if it contains a comma, quote,
// or newline, and double up any embedded quotes.
function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: Record<string, string>[], columns: { key: string; label: string }[]): string {
  const header = columns.map((c) => escapeCsvField(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(row[c.key] ?? "")).join(","));
  return [header, ...lines].join("\r\n");
}

// Triggers a browser download of the given CSV text. Client-only (needs
// document/URL), never called from a server component.
export function downloadCsv(filename: string, csv: string): void {
  // Leading BOM so Excel (the most common consumer of a church directory
  // export) opens the file as UTF-8 instead of guessing a legacy encoding.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Shared column set for People/Children exports — a superset that's still
// meaningful for both (Household Role/Grade are simply blank for a profile
// they don't apply to).
export const PROFILE_EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "status", label: "Status" },
  { key: "campus", label: "Campus" },
  { key: "household", label: "Household" },
  { key: "household_role", label: "Household Role" },
  { key: "grade", label: "Grade" },
  { key: "address", label: "Address" },
];

export function profileToExportRow(profile: Profile): Record<string, string> {
  return {
    first_name: profile.first_name,
    last_name: profile.last_name,
    email: profile.email,
    phone: profile.phone_number ?? "",
    status: profile.status,
    campus: profile.campus ?? "",
    household: profile.household_name ?? "",
    household_role: profile.household_role ?? "",
    grade: profile.academic_grade ?? "",
    address: profile.address ?? "",
  };
}
