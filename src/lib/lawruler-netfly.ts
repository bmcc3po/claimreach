import { NETFLY_ANSWER_KEY, NETFLY_CAMPAIGN } from './netfly-ontake';
import { type LrOriginal, type LrDocumentScope, recordLawRulerSource, storeLawRulerOriginals } from './lawruler-documents';

const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

export function netflyHandoffNote(fields: Record<string, unknown>): string {
  const found = Object.entries(fields).find(([name]) => key(name) === 'netflyhandoffnote');
  return typeof found?.[1] === 'string' ? found[1].trim() : '';
}

export function validateNetflyLawRulerPayload(fields: Record<string, unknown>, files: LrOriginal[], firstArrival: boolean): string | null {
  const note = netflyHandoffNote(fields);
  if (firstArrival && (note.length < 10 || note.length > 20_000)) return 'Map the complete NETFLY handoff note to NetflyHandoffNote (10 to 20,000 characters).';
  if (note.length > 20_000) return 'The NETFLY handoff note is too long.';
  if (files.length > 1) return 'Send only the signed-retainer PDF in the NETFLY webhook document category.';
  if (firstArrival && files.length !== 1) return 'Attach the existing signed-retainer PDF to this NETFLY webhook.';
  for (const file of files) {
    if (!/\.pdf$/i.test(file.name) || file.bytes.byteLength < 100 || file.bytes.byteLength > 8 * 1024 * 1024) return 'The NETFLY original must be one PDF between 100 bytes and 8 MiB.';
    const bytes = new Uint8Array(file.bytes);
    if (!new TextDecoder().decode(bytes.slice(0, 8)).startsWith('%PDF-') || !new TextDecoder().decode(bytes.slice(-2048)).includes('%%EOF'))
      return 'The signed-retainer attachment is not a complete PDF.';
  }
  return null;
}

export async function syncLawRulerNetfly(db: any, scope: LrDocumentScope, fields: Record<string, unknown>, files: LrOriginal[]) {
  await recordLawRulerSource(db, scope, fields);
  const originals = files.length ? await storeLawRulerOriginals(db, { ...scope, caseType: 'netfly_signed_retainer' }, files, {
    ...fields, attachment_manifest: JSON.stringify(files.map(file => ({ name: file.name, lead_id: scope.vendorId, claim_id: scope.claimId }))),
  }) : [];
  const note = netflyHandoffNote(fields);
  let revisions = 0;
  if (!note) {
    const read = await db.from('claims').select('answers').eq('id', scope.claimId).eq('firm_id', scope.firmId).single();
    if (read.error || !Array.isArray(read.data?.answers?.[NETFLY_ANSWER_KEY]?.handoffs) ||
        !read.data.answers[NETFLY_ANSWER_KEY].handoffs.length)
      throw new Error('No NETFLY handoff note is on this file. Repost NetflyHandoffNote.');
    revisions = read.data.answers[NETFLY_ANSWER_KEY].handoffs.length;
  }
  if (note) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const read = await db.from('claims').select('answers, updated_at').eq('id', scope.claimId).eq('firm_id', scope.firmId).single();
      if (read.error || !read.data) throw new Error('Could not read the NETFLY handoff; retry this webhook.');
      const answers = read.data.answers && typeof read.data.answers === 'object' ? read.data.answers : {};
      const current = answers[NETFLY_ANSWER_KEY] && typeof answers[NETFLY_ANSWER_KEY] === 'object' ? answers[NETFLY_ANSWER_KEY] : {};
      const handoffs = Array.isArray(current.handoffs) ? current.handoffs : [];
      revisions = handoffs.length;
      if (handoffs.at(-1)?.note === note && handoffs.at(-1)?.source_id === scope.vendorId) break;
      if (handoffs.length >= 20) throw new Error('NETFLY handoff revision limit reached; supervisor review needed.');
      const next = { ...answers, [NETFLY_ANSWER_KEY]: { ...current, version: 1,
        handoffs: [...handoffs, { note, at: new Date().toISOString(), by: 'lawruler', by_name: 'LawRuler / NETFLY', channel: 'lawruler', source_id: scope.vendorId }],
        review: { ...(current.review || {}), status: 'in_progress' } } };
      const saved = await db.from('claims').update({ answers: next, updated_at: new Date().toISOString() })
        .eq('id', scope.claimId).eq('firm_id', scope.firmId).eq('updated_at', read.data.updated_at).select('id').maybeSingle();
      if (saved.error) throw new Error(`NETFLY handoff could not be saved: ${saved.error.message}`);
      if (saved.data) { revisions = handoffs.length + 1; break; }
      if (attempt === 3) throw new Error('NETFLY handoff changed during import; retry this webhook.');
    }
  }
  return { originals, handoff_revisions: revisions, source_campaign: NETFLY_CAMPAIGN };
}
