// Which physical Brother DK label/tape is loaded varies by kiosk (DK-2205
// continuous tape vs. DK-1234 die-cut name badges), and a website has no way
// to read or set that from the OS/AirPrint driver — there's no web API that
// exposes printer paper size. So the print dimensions this app assumes are a
// client-side preference instead, persisted via localStorage (which in
// practice means each kiosk iPad just remembers its own last choice, since
// localStorage is already per-device). PrintLabelsSheet renders the chosen
// preset's dimensions as an injected <style> tag — CSS's @page at-rule can't
// be scoped by a class selector, so swapping it dynamically means replacing
// its text rather than toggling a class.
export type LabelStockId = "dk-2205" | "dk-1234" | "custom-62x46";

export interface LabelStockPreset {
  id: LabelStockId;
  label: string;
  widthMm: number;
  // "auto" for a continuous roll — Brother cuts to the content's length, so
  // there's no fixed physical height to declare. A number is a real die-cut
  // label's fixed height.
  heightMm: number | "auto";
}

export const LABEL_STOCK_PRESETS: LabelStockPreset[] = [
  { id: "dk-2205", label: "DK-2205 — 62mm continuous tape", widthMm: 62, heightMm: "auto" },
  { id: "dk-1234", label: "DK-1234 — 60mm × 86mm name badge", widthMm: 60, heightMm: 86 },
  // No DK part number confirmed for this one yet — rename once known.
  { id: "custom-62x46", label: "62mm × 46.5mm (custom)", widthMm: 62, heightMm: 46.5 },
];

export const DEFAULT_LABEL_STOCK_ID: LabelStockId = "dk-2205";

const STORAGE_KEY = "label-stock-preference";

export function getStoredLabelStockId(): LabelStockId {
  if (typeof window === "undefined") return DEFAULT_LABEL_STOCK_ID;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return LABEL_STOCK_PRESETS.some((p) => p.id === stored)
    ? (stored as LabelStockId)
    : DEFAULT_LABEL_STOCK_ID;
}

export function setStoredLabelStockId(id: LabelStockId): void {
  window.localStorage.setItem(STORAGE_KEY, id);
}

export function labelStockPreset(id: LabelStockId): LabelStockPreset {
  return LABEL_STOCK_PRESETS.find((p) => p.id === id) ?? LABEL_STOCK_PRESETS[0];
}

// The actual @page/width/height declarations for the chosen preset. Kept
// separate from globals.css's static print rules (the "hide everything but
// the label sheet" isolation trick, break-after-page, etc.), which don't
// vary by label stock and stay put there.
//
// @page's `size` descriptor is `<length>{1,2} | auto | <page-size>` — a
// fixed length and the `auto` keyword can't be mixed (confirmed against
// MDN/the CSS Paged Media spec). A continuous roll (heightMm === "auto")
// has no fixed physical height to declare, so `size` is omitted entirely
// for that case rather than emitting the invalid `62mm auto`, which
// browsers silently drop anyway — meaning it was never actually applying
// *any* page size for continuous tape before this fix, falling back to
// whatever the print target defaulted to. For continuous tape, cut length
// is left entirely to the OS/driver's own "Media & Quality" selection —
// it must be set to the actual continuous-roll media, not "Auto Select".
//
// .print-label's own height is set explicitly for a fixed-height preset too
// (not just width) — without it, the card's border/background were only as
// tall as their own text content, floating with blank paper below them
// within the physical label rather than filling it. justify-content:center
// then spreads that card's content vertically within the now-full-height
// box instead of leaving it packed at the top.
export function labelStockPrintCss(preset: LabelStockPreset): string {
  const size = preset.heightMm === "auto" ? null : `${preset.widthMm}mm ${preset.heightMm}mm`;
  const height = preset.heightMm === "auto" ? "" : `height: ${preset.heightMm}mm; `;
  return `
    @page { ${size ? `size: ${size}; ` : ""}margin: 0; }
    @media print {
      .print-label-sheet { width: ${preset.widthMm}mm; }
      .print-label {
        width: ${preset.widthMm}mm;
        max-width: ${preset.widthMm}mm;
        ${height}justify-content: center;
      }
    }
  `;
}
