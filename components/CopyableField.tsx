"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

// `icon` takes a rendered element (e.g. <Mail />), not a component
// reference — component/function references from a Server Component parent
// aren't serializable across the client-component boundary.
//
// `href`, when provided (e.g. a maps link for an address), makes the value
// itself an external link while the copy button stays a separate control —
// an <a> can't nest inside a <button>, so this renders as a row with two
// interactive children instead of a single button once href is set.
export function CopyableField({ icon, value, href }: { icon: ReactNode; value: string; href?: string }) {
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
    <div className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] text-[#3E5670] transition-colors hover:bg-brand-cream">
      {icon}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 truncate hover:text-brand-sky hover:underline"
        >
          {value}
        </a>
      ) : (
        <span className="flex-1 truncate">{value}</span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : `Copy ${value}`}
        className="shrink-0"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
        ) : (
          <Copy className="h-3.5 w-3.5 shrink-0 text-[#97A9B8]" />
        )}
      </button>
    </div>
  );
}
