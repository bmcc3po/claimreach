// Keep the vendor's intake separate from ClaimReach's completed ontake.
export const NETFLY_INTAKE_TYPE = 'netfly_intake';
export function isNetflyIntake(doc: { doc_type?: string; file_name?: string }) {
  return doc.doc_type === NETFLY_INTAKE_TYPE ||
    /\b(?:intake|ontake|client[ _-]*notes|agent[ _-]*notes)\b/i.test((doc.file_name || '').replace(/_/g, ' ')) &&
    !/retainer|agreement|contract|signed/i.test(doc.file_name || '');
}
export function netflySourceNotes(saved: any): string {
  return (saved?.handoffs || []).map((h: any) => String(h.note || '').trim()).filter(Boolean).join('\n\n--- NETFLY follow-up ---\n\n');
}
export async function buildNetflySourcePdf(note: string): Promise<Uint8Array> {
  if (!note.trim()) throw new Error('NETFLY intake notes are missing. Import the original email before sending.');
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  // Stable metadata makes replaying the same email content-addressable.
  pdf.setCreationDate(new Date('2026-01-01T00:00:00Z')); pdf.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([612, 792]), y = 744;
  const line = (text: string) => { if (y < 48) { page = pdf.addPage([612, 792]); y = 744; } page.drawText(text, { x: 48, y, size: 10, font }); y -= 14; };
  line('NETFLY intake - original email notes');
  line('Source copy supplied by NETFLY; not the ClaimReach ontake.'); line('');
  for (const paragraph of note.split(/\r?\n/)) {
    let current = '';
    const printable = [...paragraph].map(char => {
      if (char === '\t') return '    ';
      try { font.encodeText(char); return char; } catch { return `[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`; }
    }).join('');
    for (const word of printable.split(/\s+/)) {
      const next = current ? current + ' ' + word : word;
      if (current && font.widthOfTextAtSize(next, 10) > 516) { line(current); current = ''; }
      for (const char of (current ? ' ' : '') + word) {
        if (font.widthOfTextAtSize(current + char, 10) > 516) { line(current); current = ''; }
        current += char;
      }
    }
    line(current);
  }
  return pdf.save();
}
