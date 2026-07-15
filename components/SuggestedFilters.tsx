"use client";

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";

// A collapsible panel of one-click filter presets (e.g. "Arlington Members",
// "Leesburg High School (9th–12th)"). Deliberately generic over the preset
// shape (`T`) so both the People page (campus + status) and the Children
// page (campus + grade range) can reuse it — this component only renders
// buttons and hands the clicked preset back; each page owns how to turn
// that preset into URL params, since each already has its own filter-param
// plumbing (FilterPill/AddFilterMenu).
export interface SuggestedFilter<T> {
  label: string;
  preset: T;
}

export function SuggestedFilters<T>({
  filters,
  onSelect,
}: {
  filters: SuggestedFilter<T>[];
  onSelect: (preset: T) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-[12px] border border-[#E5DCC8] bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-[13.5px] font-semibold text-brand-navy">
          <Sparkles className="h-4 w-4 text-brand-sky" />
          Suggested Filters
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#8A94A0] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="flex flex-wrap gap-2 border-t border-[#F0EBDF] px-4 py-3">
          {filters.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => {
                onSelect(f.preset);
                setOpen(false);
              }}
              className="whitespace-nowrap rounded-full border border-[#E5DCC8] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#5B7185] transition-colors hover:border-brand-navy/30 hover:bg-brand-cream"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
