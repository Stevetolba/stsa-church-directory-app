"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Baby } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { PersonCard } from "@/components/PersonCard";
import { PersonCardSkeleton } from "@/components/PersonCardSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { useChildren } from "@/hooks/useChildren";
import { GRADE_LEVELS } from "@/lib/grades";
import type { Campus } from "@/types/profile";

// Children directory (ADR-0011) — a People clone scoped to household_role ===
// "child". This is the only directory surface volunteers can reach; grade
// range is the most relevant filter here, so status pills are omitted to keep
// it focused. Campus + search mirror the People page.

const CAMPUS_OPTIONS: Campus[] = ["Arlington", "Leesburg"];

export default function ChildrenPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const campus = searchParams.getAll("campus") as Campus[];
  const gradeFromRaw = searchParams.get("gradeFrom");
  const gradeToRaw = searchParams.get("gradeTo");
  const gradeFrom = gradeFromRaw ? Number(gradeFromRaw) : undefined;
  const gradeTo = gradeToRaw ? Number(gradeToRaw) : undefined;
  const page = Number(searchParams.get("page") ?? "1");

  const { data, isLoading } = useChildren({ search, campus, gradeFrom, gradeTo, page });

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

  // Toggles `value` in the campus multi-select param, resetting to page 1.
  function toggleCampus(value: string) {
    const next = campus.includes(value as Campus)
      ? campus.filter((v) => v !== value)
      : [...campus, value as Campus];
    const params = new URLSearchParams(searchParams.toString());
    params.delete("campus");
    next.forEach((v) => params.append("campus", v));
    params.delete("page");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function clearCampus() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("campus");
    params.delete("page");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  const profiles = data?.profiles ?? [];
  const total = data?.total ?? 0;
  const overallTotal = data?.overallTotal ?? 0;
  const pageSize = data?.pageSize ?? 25;
  const hasMultiplePages = total > pageSize;

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-brand-navy">Children</h1>
          <p className="mt-1 text-[14.5px] text-[#5B7185]">
            {total} of {overallTotal} children
          </p>
        </div>
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
            onClick={clearCampus}
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
                onClick={() => toggleCampus(option)}
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
        <EmptyState icon={<Baby className="h-6 w-6" />} message={`No children match "${search}".`} />
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
