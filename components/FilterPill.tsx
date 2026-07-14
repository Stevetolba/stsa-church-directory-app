"use client";

import { X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// A single "dynamic filter" pill — click the label to open a popover with the
// actual controls (checkboxes, a range, etc.), click the × to drop the filter
// entirely. `active` reflects whether a real value is set (vs. just added via
// AddFilterMenu and still empty) and drives the filled/outline styling, same
// visual language as the rest of this app's filter chips.
export function FilterPill({
  label,
  active,
  open,
  onOpenChange,
  onRemove,
  children,
}: {
  label: string;
  active: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <div
        className={`flex items-center gap-1 whitespace-nowrap rounded-full border py-2 pl-3.5 pr-2 text-[13px] font-semibold transition-colors ${
          active
            ? "border-brand-navy bg-brand-navy text-brand-cream"
            : "border-[#E5DCC8] bg-white text-[#5B7185] hover:border-brand-navy/30"
        }`}
      >
        <PopoverTrigger className="outline-none">{label}</PopoverTrigger>
        <button
          type="button"
          aria-label={`Remove ${label} filter`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={`rounded-full p-0.5 transition-colors ${
            active ? "text-brand-cream/80 hover:text-brand-cream" : "text-[#97A9B8] hover:text-[#5B7185]"
          }`}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <PopoverContent className="p-3">{children}</PopoverContent>
    </Popover>
  );
}
