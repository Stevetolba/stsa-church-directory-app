import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildLabelPdf } from "./labelPdf";

// A minimal valid 1x1 PNG — buildLabelPdf just needs *a* real PNG to embed;
// its pixel content isn't under test here, only the resulting page geometry.
const ONE_PX_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function pngBytes(): Uint8Array {
  return Uint8Array.from(atob(ONE_PX_PNG_BASE64), (c) => c.charCodeAt(0));
}

describe("buildLabelPdf", () => {
  const PT_PER_MM = 72 / 25.4;

  it("creates one PDF page per label, sized to its mm dimensions", async () => {
    const blob = await buildLabelPdf([
      { bytes: pngBytes(), widthMm: 86, heightMm: 60 },
      { bytes: pngBytes(), widthMm: 62, heightMm: 46.5 },
    ]);
    const doc = await PDFDocument.load(await blob.arrayBuffer());
    expect(doc.getPageCount()).toBe(2);

    const [p1, p2] = doc.getPages();
    expect(p1.getWidth()).toBeCloseTo(86 * PT_PER_MM, 1);
    expect(p1.getHeight()).toBeCloseTo(60 * PT_PER_MM, 1);
    expect(p2.getWidth()).toBeCloseTo(62 * PT_PER_MM, 1);
    expect(p2.getHeight()).toBeCloseTo(46.5 * PT_PER_MM, 1);
  });

  it("returns a PDF blob", async () => {
    const blob = await buildLabelPdf([{ bytes: pngBytes(), widthMm: 62, heightMm: 46.5 }]);
    expect(blob.type).toBe("application/pdf");
  });
});
