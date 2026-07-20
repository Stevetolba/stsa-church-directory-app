"use client";

import { useEffect } from "react";
import { Printer, X } from "lucide-react";
import { ChildLabel, type ChildLabelData } from "./ChildLabel";
import { ParentMatchTag, type ParentMatchTagData } from "./ParentMatchTag";

// Shown right after a batch check-in that included one or more children
// (ADR-0015): a preview of every label that would print, plus a Print
// button. Printing itself goes through the browser's own print dialog
// (window.print()) rather than talking to the label printer directly — this
// app is a serverless web app with no path to hardware sitting on the
// church's local network, so the realistic route is the iPad's OS print
// sheet via AirPrint once the Brother printer is set up on the same Wi-Fi.
// The .print-label-sheet / .print-label rules in globals.css isolate this
// region for @media print so only the labels come out, not the whole page.
export function PrintLabelsSheet({
  childLabels = [],
  parentTags = [],
  autoPrint = false,
  onClose,
}: {
  childLabels?: ChildLabelData[];
  parentTags?: ParentMatchTagData[];
  // Kiosk mode: fire the print dialog as soon as the sheet appears, so
  // check-in and printing feel like one action rather than an extra tap.
  autoPrint?: boolean;
  onClose: () => void;
}) {
  // Runs once per mount — this component is only ever mounted while there
  // are labels to show (callers render it conditionally), so mounting is
  // exactly "a fresh batch of labels is ready to print".
  useEffect(() => {
    if (autoPrint) window.print();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 print:hidden sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-[16px] bg-[#FAF7F1] shadow-xl">
        <div className="flex items-center justify-between border-b border-[#EAE2D0] px-5 py-4">
          <h2 className="font-heading text-[17px] font-semibold text-brand-navy">Print labels</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-[#8A94A0] hover:bg-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="print-label-sheet flex flex-col items-center gap-3">
            {childLabels.map((d) => (
              <ChildLabel key={d.id} data={d} />
            ))}
            {parentTags.map((d) => (
              <ParentMatchTag key={d.matchCode} data={d} />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#EAE2D0] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#E5DCC8] bg-white px-4 py-2 text-[13.5px] font-semibold text-[#5B7185] transition-colors hover:border-brand-navy/30"
          >
            Done
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-[10px] bg-brand-navy px-4 py-2 text-[13.5px] font-semibold text-brand-cream transition-colors hover:bg-brand-navy/90"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
