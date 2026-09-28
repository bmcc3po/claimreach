// Draws what the call filled in onto the blank agreement, where DocuSeal puts
// it, and marks every page PREVIEW. Shared by the preview route and its test.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Packet } from "@/lib/esign-packets/tmp-mva";

import { AGREEMENT_NAMES } from "./agreement-names";
export const AGREEMENT_NAME: Record<string, string> = AGREEMENT_NAMES;

export async function stampPreview(src: Uint8Array, packet: Packet, key: string, input: { signer: string; injured: string; today: string; doi?: string }): Promise<Uint8Array> {
  const { signer, injured, today } = input;
  const doi = input.doi || "";
  const pdf = await PDFDocument.load(src);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();

  const values: Record<string, { text: string; missing: boolean }> = {
    "Client Name": { text: signer || "MISSING: signer's name", missing: !signer },
    "Injured Party Name": { text: injured || "MISSING: injured person's name", missing: !injured },
    "Signing Date": { text: today || "MISSING: today's date", missing: !today },
    "Accident Date": { text: doi || "MISSING: date of the wreck", missing: !doi },
    "Firm Date": { text: "Dated at step 2", missing: false },
    "Patient DOB": { text: "Added by intake after she signs", missing: false },
    "Patient SSN": { text: "Added by intake after she signs", missing: false },
  };

  for (const f of packet.fields as any[]) {
    for (const a of f.areas) {
      const page = pages[a.page - 1];
      if (!page) continue;
      const { width: W, height: H } = page.getSize();
      const x = a.x * W, w = a.w * W, h = Math.max(a.h * H, 10);
      const y = H - a.y * H - h;
      if (f.type === "signature") {
        page.drawRectangle({ x, y, width: w, height: h, color: rgb(0.91, 0.94, 0.98), borderColor: rgb(0.09, 0.2, 0.31), borderWidth: 0.8, borderDashArray: [3, 2] });
        page.drawText("She signs here", { x: x + 4, y: y + Math.max(2, (h - 8) / 2), size: 8, font, color: rgb(0.09, 0.2, 0.31) });
        continue;
      }
      const v = values[f.name] || { text: "", missing: false };
      const later = f.role === "Intake";
      page.drawRectangle({ x, y, width: w, height: h, color: v.missing ? rgb(1, 0.87, 0.87) : later ? rgb(0.95, 0.95, 0.95) : rgb(1, 0.97, 0.78) });
      let size = later ? 7.5 : Math.min(10, h * 0.85);
      const fnt = later ? font : bold;
      while (size > 6 && fnt.widthOfTextAtSize(v.text, size) > w - 4) size -= 0.5;
      page.drawText(v.text, { x: x + 2, y: y + 2, size, font: fnt, color: v.missing ? rgb(0.75, 0.1, 0.1) : later ? rgb(0.4, 0.4, 0.4) : rgb(0.05, 0.08, 0.13) });
    }
  }

  const stamp = `PREVIEW, NOT SENT. ${AGREEMENT_NAME[key]} agreement. Yellow is what the call filled in.`;
  for (const p of pages) {
    const { width: W, height: H } = p.getSize();
    p.drawRectangle({ x: 0, y: H - 16, width: W, height: 16, color: rgb(0.09, 0.2, 0.31) });
    p.drawText(stamp, { x: 10, y: H - 11.5, size: 8, font: bold, color: rgb(1, 1, 1) });
  }

  return pdf.save();
}
