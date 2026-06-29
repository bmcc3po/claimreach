// Certificate of Completion generator. Produces a one-page audit certificate
// (envelope id, parties, IPs, timestamps, document hash) the way real e-sign
// platforms append to a signed document. Pure pdf-lib so it runs on the edge.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface CertData {
  envelopeId: string;
  title: string;
  signerName: string;
  signerEmail?: string | null;
  signerIp?: string | null;
  senderIp?: string | null;
  sentAt?: string | null;
  viewedAt?: string | null;
  consentAt?: string | null;
  signedAt?: string | null;
  docHash?: string | null;
  signatureType?: string | null;
}

function fmt(ts?: string | null): string {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) + " PT"; }
  catch { return ts; }
}

export async function buildCertificatePdf(d: CertData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // US Letter
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.06, 0.14, 0.25);
  const soft = rgb(0.4, 0.45, 0.52);
  const line = rgb(0.85, 0.88, 0.92);
  let y = 740;

  const text = (s: string, x: number, yy: number, f = font, size = 10, color = ink) =>
    page.drawText(s, { x, y: yy, size, font: f, color });

  // Header
  text("Certificate of Completion", 50, y, bold, 20); y -= 10;
  page.drawLine({ start: { x: 50, y: y - 6 }, end: { x: 562, y: y - 6 }, thickness: 1, color: line }); y -= 30;

  text("Envelope ID", 50, y, bold, 9, soft);
  text(d.envelopeId, 160, y, font, 10); y -= 18;
  text("Document", 50, y, bold, 9, soft);
  text(d.title.slice(0, 60), 160, y, font, 10); y -= 18;
  if (d.docHash) { text("Document hash (SHA-256)", 50, y, bold, 9, soft); text(d.docHash.slice(0, 48), 160, y, font, 8); y -= 18; }
  y -= 8;

  // Signer block
  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 0.5, color: line }); y -= 20;
  text("Signer", 50, y, bold, 12); y -= 20;
  const rows: [string, string][] = [
    ["Name", d.signerName || "—"],
    ["Email", d.signerEmail || "—"],
    ["Signature", d.signatureType === "typed" ? "Typed" : "Drawn"],
    ["Signer IP address", d.signerIp || "—"],
  ];
  for (const [k, v] of rows) { text(k, 50, y, font, 9, soft); text(v, 200, y, font, 10); y -= 16; }
  y -= 12;

  // Timeline
  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 0.5, color: line }); y -= 20;
  text("Audit timeline (Pacific Time)", 50, y, bold, 12); y -= 20;
  const tl: [string, string][] = [
    ["Sent", fmt(d.sentAt)],
    ["Viewed by signer", fmt(d.viewedAt)],
    ["Electronic consent accepted", fmt(d.consentAt)],
    ["Signed and completed", fmt(d.signedAt)],
  ];
  for (const [k, v] of tl) { text(k, 50, y, font, 9, soft); text(v, 240, y, font, 10); y -= 16; }
  y -= 12;

  // Sender / dispatch
  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 0.5, color: line }); y -= 20;
  text("Dispatch", 50, y, bold, 12); y -= 20;
  text("Sender IP address", 50, y, font, 9, soft); text(d.senderIp || "—", 200, y, font, 10); y -= 16;

  // Footer
  y = 70;
  page.drawLine({ start: { x: 50, y: y + 14 }, end: { x: 562, y: y + 14 }, thickness: 0.5, color: line });
  text("This certificate records the electronic signing of the document referenced above. The signer", 50, y, font, 8, soft); y -= 11;
  text("consented to use electronic records and signatures, and the signature was captured with the IP", 50, y, font, 8, soft); y -= 11;
  text("address and timestamps shown. This is an in-house electronic signature record.", 50, y, font, 8, soft);

  return await pdf.save();
}
