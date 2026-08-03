"use client";

import { useEffect, useState } from "react";
import { Printer, RefreshCw, Wifi } from "lucide-react";
import { toast } from "sonner";
import type { BRLMChannelResult } from "@rdlabo/capacitor-brotherprint";
import {
  clearSavedPrinter,
  discoverPrinters,
  getSavedPrinter,
  isSavedPrinterAvailable,
  savePrinter,
} from "@/lib/nativePrint";

const SEARCH_DURATION_SECONDS = 12;

// Native-only (Capacitor phase 1): lets a kiosk operator pair the app with a
// Brother QL-820NWB once, persisted via lib/nativePrint.ts's Preferences
// storage so it survives the app being backgrounded/restarted. Only ever
// mounted when isNativePrintAvailable() is true (see PrintLabelsSheet) — on
// the web this whole component tree doesn't exist, so it never has to
// reason about the web print path at all.
export function PrinterPairing() {
  const [saved, setSaved] = useState<BRLMChannelResult | null>(null);
  const [checking, setChecking] = useState(true);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<BRLMChannelResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const printer = await getSavedPrinter();
      if (cancelled) return;
      setSaved(printer);
      setChecking(false);
      if (printer) {
        const ok = await isSavedPrinterAvailable(printer);
        if (!cancelled) setReachable(ok);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSearch() {
    setSearching(true);
    setFound([]);
    const seen = new Set<string>();
    let stop: (() => void) | null = null;
    try {
      stop = await discoverPrinters(
        (printer) => {
          if (seen.has(printer.channelInfo)) return;
          seen.add(printer.channelInfo);
          setFound((prev) => [...prev, printer]);
        },
        { searchDurationSeconds: SEARCH_DURATION_SECONDS }
      );
    } catch {
      toast.error("Could not start printer search.");
      setSearching(false);
      return;
    }
    setTimeout(() => {
      stop?.();
      setSearching(false);
    }, SEARCH_DURATION_SECONDS * 1000);
  }

  async function handleSelect(printer: BRLMChannelResult) {
    await savePrinter(printer);
    setSaved(printer);
    setReachable(true);
    setFound([]);
    toast.success(`Paired with ${printer.modelName || "printer"}`);
  }

  async function handleForget() {
    await clearSavedPrinter();
    setSaved(null);
    setReachable(null);
  }

  if (checking) return null;

  return (
    <div className="flex flex-col gap-2 border-b border-[#EAE2D0] px-5 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-[#5B7185]">
          <Printer className="h-4 w-4 shrink-0" />
          {saved ? (
            <span className="truncate">
              {saved.modelName || "Printer"} ({saved.channelInfo})
              {reachable === false && (
                <span className="ml-1.5 font-semibold text-[#B04A3A]">— not reachable</span>
              )}
            </span>
          ) : (
            <span>No printer paired yet</span>
          )}
        </div>
        {saved && (
          <button
            type="button"
            onClick={handleForget}
            className="shrink-0 text-[12px] font-semibold text-[#5B7185] hover:text-brand-navy"
          >
            Forget
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={handleSearch}
        disabled={searching}
        className="flex items-center justify-center gap-1.5 rounded-[8px] border border-[#E5DCC8] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#5B7185] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {searching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
        {searching ? "Searching…" : saved ? "Search again" : "Find printer"}
      </button>
      {found.length > 0 && (
        <div className="flex flex-col gap-1">
          {found.map((printer) => (
            <button
              key={printer.channelInfo}
              type="button"
              onClick={() => handleSelect(printer)}
              className="rounded-[8px] border border-[#E5DCC8] bg-white px-3 py-2 text-left text-[12.5px] text-brand-navy hover:border-brand-navy/30"
            >
              {printer.modelName || "Printer"} — {printer.channelInfo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
