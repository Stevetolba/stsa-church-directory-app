import { describe, expect, it } from "vitest";
import { DEFAULT_LABEL_STOCK_ID, getStoredLabelStockId, labelStockPreset } from "./labelStock";

describe("labelStockPreset", () => {
  it("resolves a known id to its preset", () => {
    expect(labelStockPreset("dk-1234")).toMatchObject({ widthMm: 86, heightMm: 60 });
  });

  it("falls back to the first preset for an unknown id", () => {
    expect(labelStockPreset("nonexistent" as never).id).toBe(DEFAULT_LABEL_STOCK_ID);
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
