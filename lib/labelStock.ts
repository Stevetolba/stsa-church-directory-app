// Which physical Brother DK label/tape is loaded varies by kiosk (DK-2205
// continuous tape vs. DK-1234 die-cut name badges), and a website has no way
// to read or set that from the OS/AirPrint driver — there's no web API that
// exposes printer paper size. So the print dimensions this app assumes are a
// client-side preference instead, persisted via localStorage (which in
// practice means each kiosk iPad just remembers its own last choice, since
// localStorage is already per-device). PrintLabelsSheet reads a preset's
// widthMm/heightMm directly when building each label's PDF page (pdf-lib),
// rather than as CSS — see its buildLabelPdf.
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
