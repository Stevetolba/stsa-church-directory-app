"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Users } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { PersonCard } from "@/components/PersonCard";
import { PersonCardSkeleton } from "@/components/PersonCardSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { usePeople } from "@/hooks/usePeople";
import { GRADE_LEVELS } from "@/lib/grades";
import type { Campus, MemberStatus } from "@/types/profile";

// "People", not "Members" — the section covers every status (Visitor,
// Newcomer, etc.), and "Member" specifically means status === "Member".
// See ADR-0008.

const STATUS_OPTIONS: MemberStatus[] = [
  "Member",
  "Regular Attendee",
  "Visitor",
  "Newcomer",
  "Former Attender",
];

const CAMPUS_OPTIONS: Campus[] = ["Arlington", "Leesburg"];

export default function PeoplePage() {
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
  const page = Number(searchParams.get("page") ?? "1");

  const { data, isLoading } = usePeople({ search, status, campus, gradeFrom, gradeTo, page });

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

  // Toggles `value` in a multi-select query param (e.g. status/campus),
  // resetting to page 1 the same way single-value filters already do.
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

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-brand-navy">People</h1>
          <p className="mt-1 text-[14.5px] text-[#5B7185]">
            {total} of {overallTotal} people
          </p>
        </div>
        <div className="flex h-[34px] items-center rounded-full border border-[#C7E9F7] bg-[#E4F4FC] px-3 text-[12px] font-bold text-[#1B6E93]">
          Staff only
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
        <EmptyState icon={<Users className="h-6 w-6" />} message={`No people match "${search}".`} />
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
