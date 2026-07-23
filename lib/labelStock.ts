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
  // Printed landscape (86mm wide × 60mm tall) rather than the die-cut's
  // native portrait orientation — physical testing showed the name badge
  // reads better held/clipped horizontally.
  { id: "dk-1234", label: "DK-1234 — 86mm × 60mm name badge (landscape)", widthMm: 86, heightMm: 60 },
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
// Targets .print-image-sheet img rather than the old .print-label cards:
// printing now goes through a captured PNG of each label (see
// PrintLabelsSheet's captureLabelImage) rather than the live styled DOM —
// physical testing found window.print() on the raw HTML/CSS didn't reliably
// respect page sizing, but printing a plain image came out correctly
// proportioned. The image is already captured at the right pixel aspect
// ratio for this preset (captureLabelImage resizes the source node to
// these same mm dimensions before snapshotting it), so this CSS's width/
// height just has to match, not derive, that shape.
export function labelStockPrintCss(preset: LabelStockPreset): string {
  const size = preset.heightMm === "auto" ? null : `${preset.widthMm}mm ${preset.heightMm}mm`;
  const height = preset.heightMm === "auto" ? "" : `height: ${preset.heightMm}mm; `;
  return `
    @page { ${size ? `size: ${size}; ` : ""}margin: 0; }
    @media print {
      .print-image-sheet img {
        width: ${preset.widthMm}mm;
        ${height}
      }
    }
  `;
}
