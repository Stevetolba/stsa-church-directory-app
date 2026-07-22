import { describe, expect, it } from "vitest";
import {
  DEFAULT_LABEL_STOCK_ID,
  getStoredLabelStockId,
  labelStockPreset,
  labelStockPrintCss,
} from "./labelStock";

describe("labelStockPreset", () => {
  it("resolves a known id to its preset", () => {
    expect(labelStockPreset("dk-1234")).toMatchObject({ widthMm: 60, heightMm: 86 });
  });

  it("falls back to the first preset for an unknown id", () => {
    expect(labelStockPreset("nonexistent" as never).id).toBe(DEFAULT_LABEL_STOCK_ID);
  });
});

describe("labelStockPrintCss", () => {
  // @page's `size` descriptor is `<length>{1,2} | auto | <page-size>` — a
  // fixed length can't be mixed with the `auto` keyword (invalid per the
  // CSS Paged Media spec, silently dropped by browsers). A continuous roll
  // has no fixed height, so `size` must be omitted entirely rather than
  // emitting something like the invalid "62mm auto".
  it("omits @page size entirely for a continuous roll, but still sets width", () => {
    const css = labelStockPrintCss(labelStockPreset("dk-2205"));
    expect(css).not.toMatch(/size:\s*62mm\s*auto/);
    expect(css).not.toContain("size:");
    expect(css).toContain("@page { margin: 0; }");
    expect(css).toContain("width: 62mm;");
  });

  it("uses the fixed width and height for a die-cut label", () => {
    const css = labelStockPrintCss(labelStockPreset("dk-1234"));
    expect(css).toContain("size: 60mm 86mm;");
    expect(css).toContain("width: 60mm;");
  });

  // Regression: .print-label previously only ever got a `width` rule, never
  // `height` — the card's border/background ended up only as tall as its
  // own text, floating with blank paper below it within the physical label
  // instead of filling it.
  it("sets .print-label's height (not just width) for a fixed-size preset", () => {
    const css = labelStockPrintCss(labelStockPreset("dk-1234"));
    expect(css).toContain("height: 86mm;");
  });

  it("omits height for a continuous roll, since there's no fixed height to set", () => {
    const css = labelStockPrintCss(labelStockPreset("dk-2205"));
    expect(css).not.toMatch(/height:\s*\S/);
  });

  it("always centers content vertically within the label box", () => {
    expect(labelStockPrintCss(labelStockPreset("dk-1234"))).toContain("justify-content: center;");
    expect(labelStockPrintCss(labelStockPreset("dk-2205"))).toContain("justify-content: center;");
  });

  it("supports a fractional-mm custom preset", () => {
    const css = labelStockPrintCss(labelStockPreset("custom-62x46"));
    expect(css).toContain("size: 62mm 46.5mm;");
    expect(css).toContain("height: 46.5mm;");
  });
});

describe("getStoredLabelStockId", () => {
  // The test env has no `window` (vitest.config.ts uses environment: "node"),
  // which doubles as coverage for the SSR-safety branch: a server-rendering
  // context (no window) must fall back to the default rather than throw.
  it("falls back to the default when there is no window", () => {
    expect(getStoredLabelStockId()).toBe(DEFAULT_LABEL_STOCK_ID);
  });
});
