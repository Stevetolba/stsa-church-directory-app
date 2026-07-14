"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Baby, Download } from "lucide-react";
import { toast } from "sonner";
import { SearchBar } from "@/components/SearchBar";
import { PersonCard } from "@/components/PersonCard";
import { PersonCardSkeleton } from "@/components/PersonCardSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { useChildren } from "@/hooks/useChildren";
import { GRADE_LEVELS } from "@/lib/grades";
import { downloadCsv, PROFILE_EXPORT_COLUMNS, profileToExportRow, toCsv } from "@/lib/csv";
import type { ChildrenMemberType, ProfileSearchResult } from "@/lib/subsplash";
import type { Campus, MemberStatus } from "@/types/profile";

// Children directory (ADR-0011) — a People clone scoped to child-bearing
// households. This is the only directory surface volunteers can reach; grade
// range is the most relevant filter here, so status pills are omitted to keep
// it focused. Campus + search mirror the People page.
//
// The member-type filter defaults to "Child" (unchanged out-of-the-box
// behavior) and can widen to a child's guardians/parents ("Adult") or both
// ("All") — always still scoped to child-bearing households only, per
// searchChildren's server-side default.

const STATUS_OPTIONS: MemberStatus[] = [
  "Member",
  "Regular Attendee",
  "Visitor",
  "Newcomer",
  "Former Attender",
];

const CAMPUS_OPTIONS: Campus[] = ["Arlington", "Leesburg"];

const MEMBER_TYPE_OPTIONS: Array<{ value: ChildrenMemberType; label: string }> = [
  { value: "Child", label: "Children" },
  { value: "Adult", label: "Parents/Guardians" },
  { value: "All", label: "All Family" },
];

export default function ChildrenPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const status = searchParams.getAll("status") as MemberStatus[];
  const campus = searchParams.getAll("campus") as Campus[];
  const gradeFromRaw = searchParams.get("gradeFrom");
  const gradeToRaw = searchParams.get("gradeTo");
  const gradeFrom = gradeFromRaw ? Number(gradeFromRaw) : undefined;
  const gradeTo = gradeToRaw ? Number(gradeToRaw) : undefined;
  const memberType = (searchParams.get("memberType") as ChildrenMemberType | null) ?? "Child";
  const page = Number(searchParams.get("page") ?? "1");

  const { data, isLoading } = useChildren({ search, status, campus, gradeFrom, gradeTo, memberType, page });

  const hasActiveFilter =
    !!search ||
    status.length > 0 ||
    campus.length > 0 ||
    gradeFrom !== undefined ||
    gradeTo !== undefined ||
    memberType !== "Child";
  const [isExporting, setIsExporting] = useState(false);

  // Exports the currently filtered result set (not just the visible page) —
  // gated on hasActiveFilter so a click can't dump every child-bearing
  // household's contact info in one shot.
  async function handleExport() {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      status.forEach((s) => params.append("status", s));
      campus.forEach((c) => params.append("campus", c));
      if (gradeFrom !== undefined) params.set("gradeFrom", String(gradeFrom));
      if (gradeTo !== undefined) params.set("gradeTo", String(gradeTo));
      params.set("memberType", memberType);
      params.set("pageSize", "5000");
      const res = await fetch(`/api/children?${params.toString()}`);
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const result: ProfileSearchResult = await res.json();
      const csv = toCsv(result.profiles.map(profileToExportRow), PROFILE_EXPORT_COLUMNS);
      downloadCsv(`children-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  // Toggles `value` in a multi-select query param (status/campus), resetting
  // to page 1 — mirrors the People page's identical pattern.
  function toggleListParam(key: "status" | "campus", value: string, current: string[]) {
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    next.forEach((v) => params.append(key, v));
    params.delete("page");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function clearListParam(key: "status" | "campus") {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    params.delete("page");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  const profiles = data?.profiles ?? [];
  const total = data?.total ?? 0;
  const overallTotal = data?.overallTotal ?? 0;
  const pageSize = data?.pageSize ?? 25;
  const hasMultiplePages = total > pageSize;
  const memberTypeNoun =
    memberType === "Child" ? "children" : memberType === "Adult" ? "parents/guardians" : "family members";

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-brand-navy">Children</h1>
          <p className="mt-1 text-[14.5px] text-[#5B7185]">
            {total} of {overallTotal} {memberTypeNoun}
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={!hasActiveFilter || isExporting}
          title={hasActiveFilter ? undefined : "Apply a filter to export"}
          className="flex items-center gap-2 whitespace-nowrap rounded-[10px] border border-[#E5DCC8] bg-white px-4 py-2 text-[13.5px] font-semibold text-[#5B7185] transition-colors hover:border-brand-navy/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          {isExporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      <div className="mb-7 flex flex-wrap items-center gap-3.5">
        <SearchBar
          defaultValue={search}
          onDebouncedChange={(value) => updateParams({ search: value || null, page: null })}
          placeholder="Search by name, email, or phone"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => clearListParam("status")}
            className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
              status.length === 0
                ? "border border-brand-navy bg-brand-navy text-brand-cream"
                : "border border-[#E5DCC8] bg-white text-[#5B7185] hover:border-brand-navy/30"
            }`}
          >
            All
          </button>
          {STATUS_OPTIONS.map((option) => {
            const active = status.includes(option);
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => toggleListParam("status", option, status)}
                className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  active
                    ? "border border-brand-navy bg-brand-navy text-brand-cream"
                    : "border border-[#E5DCC8] bg-white text-[#5B7185] hover:border-brand-navy/30"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {MEMBER_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={memberType === option.value}
              onClick={() =>
                updateParams({ memberType: option.value === "Child" ? null : option.value, page: null })
              }
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                memberType === option.value
                  ? "border border-brand-navy bg-brand-navy text-brand-cream"
                  : "border border-[#E5DCC8] bg-white text-[#5B7185] hover:border-brand-navy/30"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => clearListParam("campus")}
            className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
              campus.length === 0
                ? "border border-brand-navy bg-brand-navy text-brand-cream"
                : "border border-[#E5DCC8] bg-white text-[#5B7185] hover:border-brand-navy/30"
            }`}
          >
            All Campuses
          </button>
          {CAMPUS_OPTIONS.map((option) => {
            const active = campus.includes(option);
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => toggleListParam("campus", option, campus)}
                className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  active
                    ? "border border-brand-navy bg-brand-navy text-brand-cream"
                    : "border border-[#E5DCC8] bg-white text-[#5B7185] hover:border-brand-navy/30"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
            Grade Min
          </span>
          <select
            value={gradeFromRaw ?? ""}
            onChange={(e) => updateParams({ gradeFrom: e.target.value || null, page: null })}
            className="cursor-pointer rounded-full border border-[#E5DCC8] bg-white px-3.5 py-[9px] text-[13px] font-semibold text-[#5B7185] outline-none"
          >
            <option value="">None</option>
            {GRADE_LEVELS.map((grade) => (
              <option key={grade.value} value={grade.value}>
                {grade.label}
              </option>
            ))}
          </select>
          <span className="ml-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
            Max
          </span>
          <select
            value={gradeToRaw ?? ""}
            onChange={(e) => updateParams({ gradeTo: e.target.value || null, page: null })}
            className="cursor-pointer rounded-full border border-[#E5DCC8] bg-white px-3.5 py-[9px] text-[13px] font-semibold text-[#5B7185] outline-none"
          >
            <option value="">None</option>
            {GRADE_LEVELS.map((grade) => (
              <option key={grade.value} value={grade.value}>
                {grade.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-[18px]">
          {Array.from({ length: 6 }).map((_, index) => (
            <PersonCardSkeleton key={index} />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <EmptyState icon={<Baby className="h-6 w-6" />} message={`No ${memberTypeNoun} match "${search}".`} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-[18px]">
          {profiles.map((profile, index) => (
            <PersonCard key={profile.id} profile={profile} index={index} />
          ))}
        </div>
      )}

      {hasMultiplePages && (
        <div className="mt-7 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) })}
            className="rounded-[10px] border border-[#E5DCC8] bg-white px-4 py-2 text-[13px] font-semibold text-[#5B7185] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-[13px] text-[#5B7185]">
            Page {page} of {Math.ceil(total / pageSize)}
          </span>
          <button
            type="button"
            disabled={page >= Math.ceil(total / pageSize)}
            onClick={() => updateParams({ page: String(page + 1) })}
            className="rounded-[10px] border border-[#E5DCC8] bg-white px-4 py-2 text-[13px] font-semibold text-[#5B7185] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
