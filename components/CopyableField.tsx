"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

// `icon` takes a rendered element (e.g. <Mail />), not a component
// reference — component/function references from a Server Component parent
// aren't serializable across the client-component boundary.
export function CopyableField({ icon, value }: { icon: ReactNode; value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — nothing to do.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : `Copy ${value}`}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[14px] text-[#3E5670] transition-colors hover:bg-brand-cream"
    >
      {icon}
      <span className="flex-1 truncate">{value}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 text-[#97A9B8]" />
      )}
    </button>
  );
}
