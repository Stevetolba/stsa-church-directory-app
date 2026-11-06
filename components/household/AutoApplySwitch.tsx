"use client";

import { useState } from "react";

// Admin-only control on the household updates list (ADR-0031).
export function AutoApplySwitch({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !on;
    if (next && !window.confirm("Families' edits to existing people and the household address will be saved to Subsplash as soon as they send them. New family members still wait for you. Turn this on?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/settings/household-auto-apply", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not save the setting.");
      return;
    }
    setOn(next);
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-white p-4">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Apply household changes instantly"
        disabled={busy}
        onClick={toggle}
        className={`mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-brand-navy" : "bg-muted-foreground/40"}`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
      <div className="text-sm">
        <div className="font-semibold text-brand-navy">Apply household changes instantly</div>
        <p className="text-muted-foreground">
          {on
            ? "On: edits to existing people and the household address are saved to Subsplash when a family sends them. New family members, and anything that changed in Subsplash in the meantime, still wait for your review."
            : "Off: every change waits for your review before it is written to Subsplash."}
        </p>
        {error && <p className="mt-1 text-destructive">{error}</p>}
      </div>
    </div>
  );
}
