"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Plus } from "lucide-react";

// The "+ Filter" affordance — a menu of filter dimensions not currently
// active as a pill. Picking one hands its key back to the caller, which adds
// it to the active set and (typically) opens its FilterPill popover.
export function AddFilterMenu({
  options,
  onSelect,
}: {
  options: { key: string; label: string }[];
  onSelect: (key: string) => void;
}) {
  if (options.length === 0) return null;

  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-[#C7C0AE] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#5B7185] outline-none transition-colors hover:border-brand-navy/40">
        <Plus className="h-3.5 w-3.5" />
        Filter
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner sideOffset={6} align="start" className="z-50">
          <MenuPrimitive.Popup className="min-w-40 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
            {options.map((option) => (
              <MenuPrimitive.Item
                key={option.key}
                onClick={() => onSelect(option.key)}
                className="cursor-default rounded-md px-2.5 py-1.5 text-[13.5px] text-brand-navy outline-none select-none data-highlighted:bg-brand-cream"
              >
                {option.label}
              </MenuPrimitive.Item>
            ))}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}
