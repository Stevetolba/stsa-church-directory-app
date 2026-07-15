"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/SearchBar";
import { BirthdayAgenda } from "@/components/BirthdayAgenda";
import { FilterPill } from "@/components/FilterPill";
import { AddFilterMenu } from "@/components/AddFilterMenu";
import { SuggestedFilters, type SuggestedFilter } from "@/components/SuggestedFilters";
import { usePeople } from "@/hooks/usePeople";
import { GRADE_LEVELS } from "@/lib/grades";
import type { Campus, MemberStatus } from "@/types/profile";

// Birthdays — a Google-Calendar-"Schedule"-style agenda of upcoming
// birthdays across the whole directory (staff/admin only; middleware blocks
// volunteers the same way it blocks /people — see ADR-0011's
// VOLUNTEER_BLOCKED_PATHS). The children/family-scoped equivalent lives as
// a view toggle on the Children page instead of a separate route, since
// volunteers already land there.
//
// An agenda is scrolled, not paged, so this fetches every filtered match in
// one shot (capped server-side at 5000, same as CSV export) rather than
// paginating, and has no Sort control — the list is inherently date-ordered.

const STATUS_OPTIONS: MemberStatus[] = [
  "Member",
  "Regular Attendee",
  "Visitor",
  "Newcomer",
  "Former Attender",
];

const CAMPUS_OPTIONS: Campus[] = ["Arlington", "Leesburg"];

interface BirthdaysPreset {
  campus: Campus;
  status: MemberStatus;
}

const SUGGESTED_FILTERS: SuggestedFilter<BirthdaysPreset>[] = [
  { label: "Arlington Members", preset: { campus: "Arlington", status: "Member" } },
  { label: "Arlington Regular Attendees", preset: { campus: "Arlington", status: "Regular Attendee" } },
  { label: "Leesburg Members", preset: { campus: "Leesburg", status: "Member" } },
  { label: "Leesburg Regular Attendees", preset: { campus: "Leesburg", status: "Regular Attendee" } },
];

type FilterKey = "status" | "campus" | "grade";
const ALL_FILTER_KEYS: FilterKey[] = ["status", "campus", "grade"];
const FILTER_LABELS: Record<FilterKey, string> = { status: "Status", campus: "Campus", grade: "Grade" };

function summarizeStatus(status: MemberStatus[]): string {
  if (status.length === 0) return "Status";
  if (status.length > 2) return `Status: ${status.length} selected`;
  return `Status: ${status.join(", ")}`;
}

function summarizeCampus(campus: Campus[]): string {
  if (campus.length === 0) return "Campus";
  return `Campus: ${campus.join(", ")}`;
}

function summarizeGrade(gradeFrom?: number, gradeTo?: number): string {
  if (gradeFrom === undefined && gradeTo === undefined) return "Grade";
  const from = GRADE_LEVELS.find((g) => g.value === gradeFrom)?.label;
  const to = GRADE_LEVELS.find((g) => g.value === gradeTo)?.label;
  if (from && to) return `Grade: ${from} – ${to}`;
  if (from) return `Grade: ${from}+`;
  if (to) return `Grade: up to ${to}`;
  return "Grade";
}

export default function BirthdaysPage() {
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

  const { data, isLoading } = usePeople({ search, status, campus, gradeFrom, gradeTo, pageSize: 5000 });

  const [manuallyAdded, setManuallyAdded] = useState<Set<FilterKey>>(new Set());
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const activeFilters = new Set<FilterKey>(manuallyAdded);
  if (status.length > 0) activeFilters.add("status");
  if (campus.length > 0) activeFilters.add("campus");
  if (gradeFrom !== undefined || gradeTo !== undefined) activeFilters.add("grade");

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

  function toggleListParam(key: "status" | "campus", value: string, current: string[]) {
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    next.forEach((v) => params.append(key, v));
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function handleAddFilter(key: FilterKey) {
    setManuallyAdded((prev) => new Set(prev).add(key));
    setOpenFilter(key);
  }

  function handleRemoveFilter(key: FilterKey) {
    setManuallyAdded((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (openFilter === key) setOpenFilter(null);
    if (key === "status") updateParams({ status: null });
    else if (key === "campus") updateParams({ campus: null });
    else updateParams({ gradeFrom: null, gradeTo: null });
  }

  function handleClearAll() {
    setManuallyAdded(new Set());
    setOpenFilter(null);
    updateParams({ status: null, campus: null, gradeFrom: null, gradeTo: null });
  }

  // A suggested filter fully sets Status + Campus to its exact values
  // (rather than toggling into whatever was already selected) — it's meant
  // as a "jump to this segment" shortcut. Search/Grade are left alone so a
  // preset can still be combined with them.
  function applyPreset(preset: BirthdaysPreset) {
    updateParams({ status: preset.status, campus: preset.campus });
  }

  const profiles = data?.profiles ?? [];
  const total = data?.total ?? 0;
  const withBirthday = profiles.filter((p) => p.date_of_birth).length;

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-brand-navy">Birthdays</h1>
          <p className="mt-1 text-[14.5px] text-[#5B7185]">
            {withBirthday} of {total} have a birthday on file
          </p>
        </div>
        <div className="flex h-[34px] items-center rounded-full border border-[#C7E9F7] bg-[#E4F4FC] px-3 text-[12px] font-bold text-[#1B6E93]">
          Staff only
        </div>
      </div>

      <div className="mb-4">
        <SuggestedFilters filters={SUGGESTED_FILTERS} onSelect={applyPreset} />
      </div>

      <div className="mb-7 flex flex-col gap-3">
        <SearchBar
          defaultValue={search}
          onDebouncedChange={(value) => updateParams({ search: value || null })}
          placeholder="Search by name, email, or phone"
        />

        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.has("status") && (
            <FilterPill
              label={summarizeStatus(status)}
              active={status.length > 0}
              open={openFilter === "status"}
              onOpenChange={(open) => setOpenFilter(open ? "status" : null)}
              onRemove={() => handleRemoveFilter("status")}
            >
              <div className="flex flex-col gap-1.5">
                {STATUS_OPTIONS.map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-2 text-[13.5px] text-brand-navy"
                  >
                    <input
                      type="checkbox"
                      checked={status.includes(option)}
                      onChange={() => toggleListParam("status", option, status)}
                      className="h-4 w-4 rounded border-[#E5DCC8] text-brand-navy focus:ring-brand-sky"
                    />
                    {option}
                  </label>
                ))}
              </div>
            </FilterPill>
          )}

          {activeFilters.has("campus") && (
            <FilterPill
              label={summarizeCampus(campus)}
              active={campus.length > 0}
              open={openFilter === "campus"}
              onOpenChange={(open) => setOpenFilter(open ? "campus" : null)}
              onRemove={() => handleRemoveFilter("campus")}
            >
              <div className="flex flex-col gap-1.5">
                {CAMPUS_OPTIONS.map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-2 text-[13.5px] text-brand-navy"
                  >
                    <input
                      type="checkbox"
                      checked={campus.includes(option)}
                      onChange={() => toggleListParam("campus", option, campus)}
                      className="h-4 w-4 rounded border-[#E5DCC8] text-brand-navy focus:ring-brand-sky"
                    />
                    {option}
                  </label>
                ))}
              </div>
            </FilterPill>
          )}

          {activeFilters.has("grade") && (
            <FilterPill
              label={summarizeGrade(gradeFrom, gradeTo)}
              active={gradeFrom !== undefined || gradeTo !== undefined}
              open={openFilter === "grade"}
              onOpenChange={(open) => setOpenFilter(open ? "grade" : null)}
              onRemove={() => handleRemoveFilter("grade")}
            >
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
                    Min
                  </label>
                  <select
                    value={gradeFromRaw ?? ""}
                    onChange={(e) => updateParams({ gradeFrom: e.target.value || null })}
                    className="w-full cursor-pointer rounded-lg border border-[#E5DCC8] bg-white px-2.5 py-1.5 text-[13.5px] text-brand-navy outline-none"
                  >
                    <option value="">None</option>
                    {GRADE_LEVELS.map((grade) => (
                      <option key={grade.value} value={grade.value}>
                        {grade.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
                    Max
                  </label>
                  <select
                    value={gradeToRaw ?? ""}
                    onChange={(e) => updateParams({ gradeTo: e.target.value || null })}
                    className="w-full cursor-pointer rounded-lg border border-[#E5DCC8] bg-white px-2.5 py-1.5 text-[13.5px] text-brand-navy outline-none"
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
            </FilterPill>
          )}

          <AddFilterMenu
            options={ALL_FILTER_KEYS.filter((key) => !activeFilters.has(key)).map((key) => ({
              key,
              label: FILTER_LABELS[key],
            }))}
            onSelect={(key) => handleAddFilter(key as FilterKey)}
          />

          {activeFilters.size > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="whitespace-nowrap text-[13px] font-semibold text-[#5B7185] underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="py-[60px] text-center text-[14.5px] text-[#8A94A0]">Loading birthdays…</div>
      ) : (
        <BirthdayAgenda profiles={profiles} />
      )}
    </div>
  );
}
