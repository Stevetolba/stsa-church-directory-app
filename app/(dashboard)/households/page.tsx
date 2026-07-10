"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Home, Plus } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { HouseholdCard } from "@/components/HouseholdCard";
import { HouseholdCardSkeleton } from "@/components/HouseholdCardSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { useHouseholds } from "@/hooks/useHouseholds";
import type { Campus } from "@/types/profile";

const CAMPUS_OPTIONS: Array<Campus | "All Campuses"> = ["All Campuses", "Arlington", "Leesburg"];

export default function HouseholdsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const campus = (searchParams.get("campus") as Campus | null) ?? undefined;
  const page = Number(searchParams.get("page") ?? "1");

  const { data, isLoading } = useHouseholds({ search, campus, page });

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

  const households = data?.households ?? [];
  const total = data?.total ?? 0;
  const overallTotal = data?.overallTotal ?? 0;
  const pageSize = data?.pageSize ?? 25;
  const hasMultiplePages = total > pageSize;

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-brand-navy">Families & Households</h1>
          <p className="mt-1 text-[14.5px] text-[#5B7185]">
            {total} of {overallTotal} households
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
          placeholder="Search by household name or address"
        />

        <select
          value={campus ?? "All Campuses"}
          onChange={(e) =>
            updateParams({
              campus: e.target.value === "All Campuses" ? null : e.target.value,
              page: null,
            })
          }
          className="cursor-pointer rounded-full border border-[#E5DCC8] bg-white px-3.5 py-[9px] text-[13px] font-semibold text-[#5B7185] outline-none"
        >
          {CAMPUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="ml-auto flex items-center gap-2 whitespace-nowrap rounded-[10px] bg-brand-navy px-5 py-[11px] text-[14px] font-semibold text-brand-cream"
        >
          <Plus className="h-3.5 w-3.5 text-brand-sky" />
          Add Household
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-[18px]">
          {Array.from({ length: 6 }).map((_, index) => (
            <HouseholdCardSkeleton key={index} />
          ))}
        </div>
      ) : households.length === 0 ? (
        <EmptyState icon={<Home className="h-6 w-6" />} message={`No households match "${search}".`} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-[18px]">
          {households.map((household) => (
            <HouseholdCard key={household.id} household={household} />
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
