import type { Profile } from "@/types/profile";
import type { ChildWithParents } from "@/lib/subsplash";

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

// Children and Youth export — adds Parent 1/Parent 2 contact columns
// alongside the same base fields, so a roster of children also carries who
// to contact for each. Not a new exposure: a volunteer viewing a child can
// already see that child's parents by opening the household (ADR-0011) —
// this just bundles it into the same row for a printable/shareable export.
export const CHILD_EXPORT_COLUMNS: { key: string; label: string }[] = [
  ...PROFILE_EXPORT_COLUMNS,
  { key: "parent1_name", label: "Parent 1 Name" },
  { key: "parent1_phone", label: "Parent 1 Phone" },
  { key: "parent1_email", label: "Parent 1 Email" },
  { key: "parent2_name", label: "Parent 2 Name" },
  { key: "parent2_phone", label: "Parent 2 Phone" },
  { key: "parent2_email", label: "Parent 2 Email" },
];

export function childProfileToExportRow(child: ChildWithParents): Record<string, string> {
  return {
    ...profileToExportRow(child),
    parent1_name: child.parent1 ? `${child.parent1.first_name} ${child.parent1.last_name}` : "",
    parent1_phone: child.parent1?.phone_number ?? "",
    parent1_email: child.parent1?.email ?? "",
    parent2_name: child.parent2 ? `${child.parent2.first_name} ${child.parent2.last_name}` : "",
    parent2_phone: child.parent2?.phone_number ?? "",
    parent2_email: child.parent2?.email ?? "",
  };
}
