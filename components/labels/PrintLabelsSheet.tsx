"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toBlob } from "html-to-image";
import { toast } from "sonner";
import { Printer, X } from "lucide-react";
import { ChildLabel, type ChildLabelData } from "./ChildLabel";
import { ParentMatchTag, type ParentMatchTagData } from "./ParentMatchTag";
import { buildLabelPdf, type LabelPdfPage } from "@/lib/labelPdf";
import {
  LABEL_STOCK_PRESETS,
  getStoredLabelStockId,
  labelStockPreset,
  setStoredLabelStockId,
  type LabelStockId,
} from "@/lib/labelStock";

// Shown right after a batch check-in that included one or more children
// (ADR-0015): a preview of every label that would print, plus a Print
// button. Rendered via createPortal(..., document.body) purely as a normal
// modal-overlay pattern (so it visually sits above the rest of the app) —
// printing itself no longer depends on this page's DOM or CSS at all (see
// below), so the portal isn't doing double duty as print-isolation the way
// it once did.
//
// Printing builds an actual PDF client-side instead of asking the browser
// to print this page. Two earlier approaches both ran into real iOS Safari/
// AirPrint limitations: printing the live styled ChildLabel/ParentMatchTag
// DOM ignored this app's @page sizing entirely (a full Letter/A4 page came
// out regardless), and printing a correctly-shaped captured image of each
// label (still window.print() on this page) left the print dialog with no
// paper-size control at all and merged multiple labels onto a single page
// instead of fragmenting them via CSS break-after. Both failures trace back
// to the same root cause: asking Safari's own print pipeline to print an
// HTML page just isn't reliable for this. A PDF sidesteps that pipeline's
// guesswork — each label is still captured as a PNG (html-to-image, reusing
// the exact ChildLabel/ParentMatchTag DOM so there's no separate Canvas-
// drawing code to keep visually in sync), but instead of printing those
// images as part of this page, they're embedded as real PDF pages
// (lib/labelPdf.ts) with page sizes read directly from the mm dimensions,
// and that PDF is loaded into a hidden iframe and printed via *its own*
// contentWindow.print() — a separate document/print context from this page,
// where page size and page count are both explicit document properties
// rather than something the print pipeline has to infer.
export function PrintLabelsSheet({
  childLabels = [],
  parentTags = [],
  autoPrint = false,
  onClose,
}: {
  childLabels?: ChildLabelData[];
  parentTags?: ParentMatchTagData[];
  // Kiosk mode: fire the print flow as soon as the sheet appears, so
  // check-in and printing feel like one action rather than an extra tap.
  autoPrint?: boolean;
  onClose: () => void;
}) {
  // Lazy initializer reads localStorage synchronously on mount — safe even
  // though this is a client component rendered purely in response to a
  // check-in (never server-rendered upfront), so there's no hydration
  // mismatch to worry about.
  const [stockId, setStockId] = useState<LabelStockId>(() => getStoredLabelStockId());
  const preset = labelStockPreset(stockId);
  const [printing, setPrinting] = useState(false);
  const [printPdfUrl, setPrintPdfUrl] = useState<string | null>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  function handleStockChange(id: LabelStockId) {
    setStockId(id);
    setStoredLabelStockId(id);
  }

  // Runs once per mount — this component is only ever mounted while there
  // are labels to show (callers render it conditionally), so mounting is
  // exactly "a fresh batch of labels is ready to print".
  useEffect(() => {
    if (autoPrint) handlePrint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The object URL is only good for the lifetime of this print pass —
  // revoke whichever one just got replaced (or the last one, on unmount) so
  // we don't leak memory across repeated reprints in the same session.
  useEffect(() => {
    return () => {
      if (printPdfUrl) URL.revokeObjectURL(printPdfUrl);
    };
  }, [printPdfUrl]);

  async function captureLabelImage(node: HTMLElement): Promise<LabelPdfPage> {
    const original = node.style.cssText;
    node.style.width = `${preset.widthMm}mm`;
    node.style.maxWidth = "none";
    if (preset.heightMm === "auto") {
      node.style.height = "";
      node.style.justifyContent = "";
    } else {
      node.style.height = `${preset.heightMm}mm`;
      node.style.justifyContent = "center";
    }
    // The rounded border/card background (ChildLabel.tsx/ParentMatchTag.tsx)
    // is only meant for the on-screen preview look — baked into the
    // captured image, it would print as a wasted border/box on the actual
    // label stock, which is already its own "card".
    node.style.border = "none";
    node.style.borderRadius = "0";
    node.style.background = "none";
    node.style.boxShadow = "none";
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      // Measured right after the resize above, so this is the node's real
      // physical shape: width is exactly preset.widthMm by construction; for
      // a continuous-roll preset (no fixed heightMm) the content's natural
      // height is derived from that same ratio rather than guessed at.
      const rect = node.getBoundingClientRect();
      const heightMm = preset.heightMm === "auto" ? (rect.height / rect.width) * preset.widthMm : preset.heightMm;
      const blob = await toBlob(node, { pixelRatio: 3, backgroundColor: "#ffffff" });
      if (!blob) throw new Error("Could not generate image");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return { bytes, widthMm: preset.widthMm, heightMm };
    } finally {
      node.style.cssText = original;
    }
  }

  async function handlePrint() {
    if (!labelsRef.current) return;
    setPrinting(true);
    try {
      const nodes = Array.from(labelsRef.current.querySelectorAll<HTMLElement>(".print-label"));
      // Captured sequentially: each capture temporarily mutates the live
      // node's inline style, and there's no real speedup from overlapping
      // that dance across nodes.
      const pages: LabelPdfPage[] = [];
      for (const node of nodes) {
        pages.push(await captureLabelImage(node));
      }
      const pdfBlob = await buildLabelPdf(pages);
      setPrintPdfUrl(URL.createObjectURL(pdfBlob));
    } catch {
      toast.error("Could not generate labels for printing.");
      setPrinting(false);
    }
  }

  // No SSR/mounted guard needed: this component only ever mounts in
  // response to client-side state a parent sets after user interaction
  // (labelsToPrint/reprintData starting null), so it's never part of the
  // server-rendered payload or the initial hydration pass — `document`
  // is always available by the time this body runs.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
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
        <div className="flex items-center gap-2 border-b border-[#EAE2D0] px-5 py-3">
          <label htmlFor="label-stock" className="text-[12.5px] font-semibold text-[#5B7185]">
            Label size
          </label>
          <select
            id="label-stock"
            value={stockId}
            onChange={(e) => handleStockChange(e.target.value as LabelStockId)}
            className="cursor-pointer rounded-lg border border-[#E5DCC8] bg-white px-2.5 py-1.5 text-[13px] text-brand-navy outline-none"
          >
            {LABEL_STOCK_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div ref={labelsRef} className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col items-center gap-3">
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
            onClick={handlePrint}
            disabled={printing}
            className="flex items-center gap-1.5 rounded-[10px] bg-brand-navy px-4 py-2 text-[13.5px] font-semibold text-brand-cream transition-colors hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            {printing ? "Preparing…" : "Print"}
          </button>
        </div>
      </div>
      {/* Loads the generated PDF and prints it via its own contentWindow —
          a separate document/print context from this page. A physical
          test showed a zero-size iframe isn't a valid print target on iOS
          Safari: contentWindow.print() silently fell back to printing the
          *parent* page instead (visible from Safari's auto-injected
          URL/timestamp/page-count footer, which only ever appears on a
          printed webpage, never on a viewed PDF) — hence 1px square and
          offscreen rather than 0×0, and contentWindow.focus() right before
          print() so iOS treats this frame, not the parent document, as the
          thing being printed. */}
      <iframe
        ref={printFrameRef}
        src={printPdfUrl ?? undefined}
        title="Print labels"
        className="fixed left-[-9999px] top-0 h-px w-px border-0"
        onLoad={() => {
          if (!printPdfUrl) return; // the initial about:blank load, before there's anything to print
          printFrameRef.current?.contentWindow?.focus();
          printFrameRef.current?.contentWindow?.print();
          setPrinting(false);
        }}
      />
    </div>,
    document.body
  );
}
