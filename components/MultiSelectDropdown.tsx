"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// A button that opens a searchable checkbox list. Used for the volunteer
// roster's Team / Role filters and the admin Team / Role pickers. Controlled:
// the parent owns `value`. Selected values that aren't in `options` (e.g. a
// choice nobody else holds) are still listed so they can be unchecked.
export function MultiSelectDropdown({
  id,
  label,
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled = false,
}: {
  id?: string;
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const allOptions = useMemo(() => {
    const set = new Set(options);
    value.forEach((v) => set.add(v));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [options, value]);

  const visible = allOptions.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()));

  function toggle(option: string) {
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[42px] w-full items-center justify-between gap-2 rounded-[10px] border border-[#CBD2D9] bg-white px-3.5 py-2 text-left text-[14px] text-brand-navy outline-none focus:border-brand-sky disabled:opacity-60"
      >
        <span className="flex flex-wrap gap-1.5">
          {value.length === 0 ? (
            <span className="text-[#8A94A0]">{placeholder}</span>
          ) : (
            value.map((v) => (
              <span
                key={v}
                className="rounded-full bg-[#EAF0F5] px-2.5 py-0.5 text-[12px] font-semibold text-brand-navy"
              >
                {v}
              </span>
            ))
          )}
        </span>
        <span aria-hidden className="text-[11px] text-[#8A94A0]">
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[220px] rounded-[10px] border border-[#CBD2D9] bg-white p-2 shadow-lg">
          {allOptions.length > 6 && (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label={`Search ${label}`}
              className="mb-2 w-full rounded-lg border border-[#CBD2D9] px-3 py-1.5 text-[13px] outline-none focus:border-brand-sky"
            />
          )}
          <ul role="listbox" aria-multiselectable="true" aria-label={label} className="max-h-60 overflow-y-auto">
            {visible.length === 0 && (
              <li className="px-2 py-2 text-[13px] text-[#8A94A0]">
                {allOptions.length === 0 ? "No options found yet." : "No matches."}
              </li>
            )}
            {visible.map((option) => {
              const checked = value.includes(option);
              return (
                <li key={option} role="option" aria-selected={checked}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13.5px] text-brand-navy hover:bg-[#F3F6F9]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(option)}
                      className="h-4 w-4 rounded border-[#CBD2D9] text-brand-navy focus:ring-brand-sky"
                    />
                    {option}
                  </label>
                </li>
              );
            })}
          </ul>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-2 w-full rounded-md px-2 py-1 text-left text-[12px] font-semibold text-[#5B7185] hover:bg-[#F3F6F9]"
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}
