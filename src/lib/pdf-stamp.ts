// Stamp a drawn/typed signature (and auto-date) onto an uploaded PDF at the
// field boxes placed in PdfFieldEditor. Fields are stored as page-relative
// percentages; pdf-lib uses points from the bottom-left, so we convert.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface PdfField {
  id: string; page: number; kind: string; role: string;
  xPct: number; yPct: number; wPct: number; hPct: number; label?: string;
}

export async function stampPdf(opts: {
  sourceBytes: Uint8Array;
  fields: PdfField[];
  signaturePng?: string | null;  // dataURL
  signerName: string;
  signedDate?: Date;
}): Promise<Uint8Array> {
  const { sourceBytes, fields, signaturePng, signerName } = opts;
  const signedDate = opts.signedDate || new Date();
  const pdf = await PDFDocument.load(sourceBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();

  let sigImg: any = null;
  if (signaturePng && signaturePng.startsWith("data:image/png")) {
    try { sigImg = await pdf.embedPng(signaturePng); } catch { sigImg = null; }
  }

  const dateStr = signedDate.toLocaleDateString("en-US");

  for (const f of fields) {
    // Only stamp client-assigned fields.
    if (f.role && f.role !== "client") continue;
    const pageIdx = (f.page || 1) - 1;
    const page = pages[pageIdx];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();

    // Convert percentages (top-left origin) to points (bottom-left origin).
    const x = (f.xPct / 100) * pw;
    const wTop = (f.yPct / 100) * ph;          // distance from top
    const w = (f.wPct / 100) * pw;
    const h = (f.hPct / 100) * ph;
    const yBottom = ph - wTop - h;             // bottom-left y

    if (f.kind === "signature" || f.kind === "initials") {
      if (sigImg) {
        // Fit the signature image inside the box, preserving aspect.
        const ar = sigImg.width / sigImg.height;
        let dw = w, dh = w / ar;
        if (dh > h) { dh = h; dw = h * ar; }
        page.drawImage(sigImg, { x: x + (w - dw) / 2, y: yBottom + (h - dh) / 2, width: dw, height: dh });
      } else {
        page.drawText(signerName, { x: x + 4, y: yBottom + h / 2 - 5, size: Math.min(14, h * 0.6), font, color: rgb(0.06, 0.14, 0.25) });
      }
    } else if (f.kind === "date") {
      page.drawText(dateStr, { x: x + 4, y: yBottom + h / 2 - 5, size: Math.min(12, h * 0.6), font, color: rgb(0.06, 0.14, 0.25) });
    } else if (f.kind === "text") {
      page.drawText(signerName, { x: x + 4, y: yBottom + h / 2 - 5, size: Math.min(12, h * 0.6), font, color: rgb(0.06, 0.14, 0.25) });
    } else if (f.kind === "checkbox") {
      page.drawText("X", { x: x + w / 2 - 4, y: yBottom + h / 2 - 5, size: Math.min(14, h * 0.7), font, color: rgb(0.06, 0.14, 0.25) });
    }
  }

  return await pdf.save();
}
