"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toBlob } from "html-to-image";
import { toast } from "sonner";
import { Printer, X } from "lucide-react";
import { ChildLabel, type ChildLabelData } from "./ChildLabel";
import { ParentMatchTag, type ParentMatchTagData } from "./ParentMatchTag";
import {
  LABEL_STOCK_PRESETS,
  getStoredLabelStockId,
  labelStockPreset,
  labelStockPrintCss,
  setStoredLabelStockId,
  type LabelStockId,
} from "@/lib/labelStock";

// Shown right after a batch check-in that included one or more children
// (ADR-0015): a preview of every label that would print, plus a Print
// button. The .print-label-sheet / .print-label rules in globals.css
// isolate this region for @media print so only the labels come out, not
// the whole page; the actual physical dimensions come from the "Label
// size" picker below (lib/labelStock.ts) since different kiosks load
// different DK stock and a website has no way to read that off the
// printer itself.
//
// Rendered via createPortal(..., document.body) rather than in place: the
// print CSS needs to hide *everything else on the page* (the kiosk/dashboard
// UI this sheet is opened from), and the only way to do that safely is
// display:none on every other body-level element — display:none on an
// *ancestor* of the printable content is not an option (it removes the
// whole subtree from the render tree with no way for a descendant to opt
// back in, confirmed the hard way once already). A portal makes this
// component itself a direct child of <body>, i.e. a sibling of the rest of
// the app rather than nested inside it, so "hide every other body child" is
// exactly the right selector and never touches one of this sheet's own
// ancestors. It also avoids a second, subtler bug: before the portal, the
// rest of the page stayed in normal document flow (just invisible), so its
// full height printed as blank leading pages ahead of the real labels.
//
// Printing does NOT call window.print() on the live ChildLabel/ParentMatchTag
// DOM. Physical testing showed iOS Safari's AirPrint pipeline doesn't
// reliably respect this app's @page sizing for a label printer — its own
// print preview renders a full Letter/A4-shaped page regardless of what's
// declared, a platform limitation no CSS here can override, and a captured
// image instead came out correctly proportioned. So each label is captured
// as its own PNG (via html-to-image, reusing the exact ChildLabel/
// ParentMatchTag DOM so there's no separate Canvas-drawing code to keep
// visually in sync) and printed as a plain <img> through the browser's own
// print dialog. html-to-image snapshots the node exactly as it's currently
// painted on screen — and on screen these cards use the wide modal-preview
// layout, not the narrow/tall shape the physical label stock needs (that
// shape only exists inside @media print). So captureLabelImage temporarily
// applies the selected preset's width/height to the node, waits a frame for
// the resize to actually reflow, snapshots it, then restores the node's
// original inline style — the exported image ends up already shaped like
// the physical label instead of whatever the on-screen content happened to
// render at.
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
  const [printImageUrls, setPrintImageUrls] = useState<string[] | null>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const printSheetRef = useRef<HTMLDivElement>(null);

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

  // Object URLs are only good for the lifetime of this print pass — revoke
  // whichever batch just got replaced (or the last one, on unmount) so we
  // don't leak memory across repeated reprints in the same session.
  useEffect(() => {
    return () => {
      printImageUrls?.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [printImageUrls]);

  // Once a fresh batch of images lands in state, wait for the <img> tags to
  // actually finish loading (decoding an object URL is effectively
  // instant, but still asynchronous) before calling window.print() —
  // printing before they've painted would produce blank labels.
  useEffect(() => {
    if (!printImageUrls || !printSheetRef.current) return;
    let cancelled = false;
    const imgs = Array.from(printSheetRef.current.querySelectorAll("img"));
    Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) return resolve();
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
      )
    ).then(() => {
      if (cancelled) return;
      window.print();
      setPrinting(false);
    });
    return () => {
      cancelled = true;
    };
  }, [printImageUrls]);

  async function captureLabelImage(node: HTMLElement): Promise<string> {
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
      const blob = await toBlob(node, { pixelRatio: 3, backgroundColor: "#ffffff" });
      if (!blob) throw new Error("Could not generate image");
      return URL.createObjectURL(blob);
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
      const urls: string[] = [];
      for (const node of nodes) {
        urls.push(await captureLabelImage(node));
      }
      setPrintImageUrls(urls);
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
    // print-labels-root (globals.css): the one body-level element print CSS
    // keeps visible; every other body child gets display:none. print-pass-
    // through: at print time these two wrappers stop being position:fixed /
    // overflow+max-height clipped, since an ancestor that's out of normal
    // flow (or clipping overflow) silently defeats the break-after page
    // rules on .print-image-sheet — CSS fragmentation only fragments
    // ordinary in-flow content. The chrome that isn't an ancestor of
    // .print-image-sheet (header, the picker below, the footer buttons) is
    // hidden the simpler way, via print:hidden.
    <div className="print-labels-root print-pass-through fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      {/* @page can't be scoped by a class selector, so the chosen preset's
          size/width rules are injected as raw CSS text rather than toggled
          via a className — see labelStockPrintCss. */}
      <style dangerouslySetInnerHTML={{ __html: labelStockPrintCss(preset) }} />
      <div className="print-pass-through flex max-h-[85vh] w-full max-w-lg flex-col rounded-[16px] bg-[#FAF7F1] shadow-xl">
        <div className="flex items-center justify-between border-b border-[#EAE2D0] px-5 py-4 print:hidden">
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
        <div className="flex items-center gap-2 border-b border-[#EAE2D0] px-5 py-3 print:hidden">
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
        <div ref={labelsRef} className="flex-1 overflow-y-auto px-5 py-4 print:hidden">
          <div className="flex flex-col items-center gap-3">
            {childLabels.map((d) => (
              <ChildLabel key={d.id} data={d} />
            ))}
            {parentTags.map((d) => (
              <ParentMatchTag key={d.matchCode} data={d} />
            ))}
          </div>
        </div>
        {/* Populated right before window.print() with the captured PNGs —
            see captureLabelImage/handlePrint above. Hidden on screen
            (globals.css), shown only for the print pass. */}
        <div ref={printSheetRef} className="print-image-sheet">
          {printImageUrls?.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- a blob: URL, not a remote image next/image would optimize
            <img key={i} src={url} alt="" />
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#EAE2D0] px-5 py-4 print:hidden">
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
