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
// Printing builds an actual PDF client-side and hands it to the OS via the
// Web Share API rather than asking the browser to print anything itself.
// Three earlier approaches all failed on real iOS Safari/AirPrint hardware:
//   1. window.print() on the live styled ChildLabel/ParentMatchTag DOM —
//      ignored this app's @page sizing entirely (a full Letter/A4 page came
//      out regardless).
//   2. window.print() on correctly-shaped captured images of each label
//      (still printing this page) — the print dialog had no paper-size
//      control at all and merged multiple labels onto one page instead of
//      fragmenting them via CSS break-after.
//   3. Building an actual PDF (real per-label page sizes, no CSS involved)
//      and printing it via a hidden iframe's own contentWindow.print() —
//      confirmed (via Safari's auto-injected URL/timestamp/page-count
//      footer, which only appears on a printed *webpage*, never on a
//      viewed PDF) that this silently fell back to printing the parent
//      page instead of the iframe's PDF, even after giving the iframe real
//      dimensions and focusing it first.
// All three share a root cause: asking Safari's own in-page print pipeline
// to print *anything* on this device isn't reliable. The one thing that
// did work, earlier in this project, was handing a file to the OS via
// navigator.share() and letting the user pick "Print" from the native
// share sheet — a completely different pipeline, outside Safari's in-page
// print path. So the PDF (still built the same way — each label captured
// as a PNG via html-to-image, embedded as its own correctly-sized PDF page,
// see lib/labelPdf.ts) is shared as a file instead of loaded into an
// iframe. Sharing requires a real user gesture, which the manual Print
// button provides directly; the auto-print-after-check-in kiosk flow
// attempts it too, but if the browser rejects it for lacking a fresh
// gesture, the failure is caught and the modal simply stays open with its
// Print button available for a real tap.
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
  const labelsRef = useRef<HTMLDivElement>(null);

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
      const file = new File([pdfBlob], "labels.pdf", { type: "application/pdf" });
      if (!navigator.canShare?.({ files: [file] })) {
        toast.error("This browser can't share files for printing.");
        return;
      }
      await navigator.share({ files: [file] });
    } catch (e) {
      // AbortError: the user closed the share sheet without picking
      // anything — not a real failure, nothing to report. Anything else
      // (including a missing-gesture rejection from an auto-print attempt)
      // leaves the modal open with Print still available for a real tap.
      if (e instanceof Error && e.name !== "AbortError") {
        toast.error("Could not prepare labels for printing — tap Print to try again.");
      }
    } finally {
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
    </div>,
    document.body
  );
}
