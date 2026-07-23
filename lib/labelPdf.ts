import { PDFDocument } from "pdf-lib";

const PT_PER_MM = 72 / 25.4;

export interface LabelPdfPage {
  bytes: Uint8Array;
  widthMm: number;
  heightMm: number;
}

// Builds one PDF with one page per captured label image, each page's
// physical size set directly from the label stock's real mm dimensions.
// This is deliberately not CSS: physical testing showed iOS Safari's print
// pipeline doesn't reliably respect @page sizing, and even printing a
// correctly-shaped captured image still left the print dialog with no
// paper-size control and merged multiple images onto one page instead of
// fragmenting them via CSS break-after. A PDF's page size is a property of
// the document itself, and its page boundaries are real and discrete — a
// print driver doesn't have to infer either one, it just reads them.
export async function buildLabelPdf(pages: LabelPdfPage[]): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  for (const page of pages) {
    const png = await pdfDoc.embedPng(page.bytes);
    const widthPt = page.widthMm * PT_PER_MM;
    const heightPt = page.heightMm * PT_PER_MM;
    const pdfPage = pdfDoc.addPage([widthPt, heightPt]);
    pdfPage.drawImage(png, { x: 0, y: 0, width: widthPt, height: heightPt });
  }
  const bytes = await pdfDoc.save();
  // pdf-lib types this Uint8Array over ArrayBufferLike (which includes
  // SharedArrayBuffer); BlobPart requires a concrete ArrayBuffer. It's
  // always a plain ArrayBuffer at runtime — pdf-lib never allocates via
  // SharedArrayBuffer — so this is a type-only cast, not a behavior change.
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
