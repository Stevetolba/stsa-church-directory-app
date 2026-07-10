"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

interface SearchBarProps {
  defaultValue?: string;
  onDebouncedChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

export function SearchBar({
  defaultValue = "",
  onDebouncedChange,
  placeholder,
  debounceMs = 300,
  className = "",
}: SearchBarProps) {
  const [value, setValue] = useState(defaultValue);
  const isFirstRender = useRef(true);

  // Resync when the value changes externally (e.g. browser back/forward).
  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const handle = setTimeout(() => onDebouncedChange(value), debounceMs);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, debounceMs]);

  return (
    <div
      className={`flex min-w-[260px] max-w-[440px] flex-1 items-center gap-2.5 rounded-[10px] border border-[#E5DCC8] bg-white px-4 py-[11px] shadow-[0_1px_2px_rgba(26,58,92,0.04)] ${className}`}
    >
      <Search className="h-4 w-4 shrink-0 text-[#97A9B8]" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full border-none bg-transparent text-[14.5px] text-brand-navy outline-none placeholder:text-[#97A9B8]"
      />
    </div>
  );
}
