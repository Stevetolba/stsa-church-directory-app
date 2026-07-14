"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Baby, Cake, Download } from "lucide-react";
import { toast } from "sonner";
import { SearchBar } from "@/components/SearchBar";
import { PersonCard } from "@/components/PersonCard";
import { PersonCardSkeleton } from "@/components/PersonCardSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { BirthdayAgenda } from "@/components/BirthdayAgenda";
import { FilterPill } from "@/components/FilterPill";
import { AddFilterMenu } from "@/components/AddFilterMenu";
import { useChildren } from "@/hooks/useChildren";
import { GRADE_LEVELS } from "@/lib/grades";
import { downloadCsv, PROFILE_EXPORT_COLUMNS, profileToExportRow, toCsv } from "@/lib/csv";
import type { ChildrenMemberType, ProfileSearchResult, SearchProfilesParams } from "@/lib/subsplash";
import type { Campus, MemberStatus } from "@/types/profile";

// Children directory (ADR-0011) — a People clone scoped to child-bearing
// households. This is the only directory surface volunteers can reach.
//
// Filters are "dynamic" (Subsplash's own People page pattern, mirrored on
// app/(dashboard)/people/page.tsx): only *active* dimensions show as a pill
// (value summary + a popover to edit it); inactive ones live behind
// "+ Filter". Family scope defaults to "Child" (unchanged out-of-the-box
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

type FilterKey = "status" | "campus" | "grade" | "memberType";
const ALL_FILTER_KEYS: FilterKey[] = ["status", "campus", "grade", "memberType"];
const FILTER_LABELS: Record<FilterKey, string> = {
  status: "Status",
  campus: "Campus",
  grade: "Grade",
  memberType: "Family",
};

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

function summarizeMemberType(memberType: ChildrenMemberType): string {
  if (memberType === "Child") return "Family";
  const found = MEMBER_TYPE_OPTIONS.find((o) => o.value === memberType);
  return `Family: ${found?.label ?? memberType}`;
}

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
  const sortBy =
    (searchParams.get("sortBy") as NonNullable<SearchProfilesParams["sortBy"]> | null) ?? "last_name";
  const page = Number(searchParams.get("page") ?? "1");
  // Birthdays is an agenda (scrolled, not paged), so it fetches every match
  // in one shot instead of paginating — same technique as CSV export.
  const view = (searchParams.get("view") as "directory" | "birthdays" | null) ?? "directory";

  const { data, isLoading } = useChildren({
    search,
    status,
    campus,
    gradeFrom,
    gradeTo,
    memberType,
    sortBy,
    page,
    pageSize: view === "birthdays" ? 5000 : undefined,
  });

  // Dimensions with a real (non-default) value are always "active" (so
  // reloading a filtered URL still shows the right pills); manuallyAdded
  // additionally keeps a just-added-but-not-yet-configured pill visible
  // until it's given a value or removed.
  const [manuallyAdded, setManuallyAdded] = useState<Set<FilterKey>>(new Set());
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const activeFilters = new Set<FilterKey>(manuallyAdded);
  if (status.length > 0) activeFilters.add("status");
  if (campus.length > 0) activeFilters.add("campus");
  if (gradeFrom !== undefined || gradeTo !== undefined) activeFilters.add("grade");
  if (memberType !== "Child") activeFilters.add("memberType");

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
      params.set("sortBy", sortBy);
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
    if (key === "status") updateParams({ status: null, page: null });
    else if (key === "campus") updateParams({ campus: null, page: null });
    else if (key === "grade") updateParams({ gradeFrom: null, gradeTo: null, page: null });
    else updateParams({ memberType: null, page: null });
  }

  function handleClearAll() {
    setManuallyAdded(new Set());
    setOpenFilter(null);
    updateParams({
      status: null,
      campus: null,
      gradeFrom: null,
      gradeTo: null,
      memberType: null,
      page: null,
    });
  }

  const profiles = data?.profiles ?? [];
  const total = data?.total ?? 0;
  const overallTotal = data?.overallTotal ?? 0;
  const pageSize = data?.pageSize ?? 25;
  const hasMultiplePages = total > pageSize;
  const memberTypeNoun =
    memberType === "Child" ? "children" : memberType === "Adult" ? "parents/guardians" : "family members";
  const withBirthday = profiles.filter((p) => p.date_of_birth).length;

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-brand-navy">Children and Youth</h1>
          <p className="mt-1 text-[14.5px] text-[#5B7185]">
            {view === "birthdays"
              ? `${withBirthday} of ${total} ${memberTypeNoun} have a birthday on file`
              : `${total} of ${overallTotal} ${memberTypeNoun}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-full border border-[#E5DCC8] bg-white p-0.5">
            <button
              type="button"
              onClick={() => updateParams({ view: null, page: null })}
              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                view === "directory" ? "bg-brand-navy text-brand-cream" : "text-[#5B7185]"
              }`}
            >
              Directory
            </button>
            <button
              type="button"
              onClick={() => updateParams({ view: "birthdays", page: null })}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                view === "birthdays" ? "bg-brand-navy text-brand-cream" : "text-[#5B7185]"
              }`}
            >
              <Cake className="h-3.5 w-3.5" />
              Birthdays
            </button>
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
      </div>

      <div className="mb-7 flex flex-col gap-3">
        <SearchBar
          defaultValue={search}
          onDebouncedChange={(value) => updateParams({ search: value || null, page: null })}
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
                    onChange={(e) => updateParams({ gradeFrom: e.target.value || null, page: null })}
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
                    onChange={(e) => updateParams({ gradeTo: e.target.value || null, page: null })}
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

          {activeFilters.has("memberType") && (
            <FilterPill
              label={summarizeMemberType(memberType)}
              active={memberType !== "Child"}
              open={openFilter === "memberType"}
              onOpenChange={(open) => setOpenFilter(open ? "memberType" : null)}
              onRemove={() => handleRemoveFilter("memberType")}
            >
              <div className="flex flex-col gap-1">
                {MEMBER_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      updateParams({ memberType: option.value === "Child" ? null : option.value, page: null })
                    }
                    className={`rounded-md px-2.5 py-1.5 text-left text-[13.5px] transition-colors ${
                      memberType === option.value
                        ? "bg-brand-cream font-semibold text-brand-navy"
                        : "text-brand-navy hover:bg-brand-cream/60"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
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

          {view === "directory" && (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#8A94A0]">
                Sort
              </span>
              <select
                value={sortBy}
                onChange={(e) =>
                  updateParams({ sortBy: e.target.value === "last_name" ? null : e.target.value, page: null })
                }
                className="cursor-pointer rounded-full border border-[#E5DCC8] bg-white px-3.5 py-[9px] text-[13px] font-semibold text-[#5B7185] outline-none"
              >
                <option value="last_name">Last Name</option>
                <option value="first_name">First Name</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        view === "birthdays" ? (
          <div className="py-[60px] text-center text-[14.5px] text-[#8A94A0]">Loading birthdays…</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-[18px]">
            {Array.from({ length: 6 }).map((_, index) => (
              <PersonCardSkeleton key={index} />
            ))}
          </div>
        )
      ) : view === "birthdays" ? (
        <BirthdayAgenda profiles={profiles} />
      ) : profiles.length === 0 ? (
        <EmptyState icon={<Baby className="h-6 w-6" />} message={`No ${memberTypeNoun} match "${search}".`} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-[18px]">
          {profiles.map((profile, index) => (
            <PersonCard key={profile.id} profile={profile} index={index} />
          ))}
        </div>
      )}

      {view === "directory" && hasMultiplePages && (
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
