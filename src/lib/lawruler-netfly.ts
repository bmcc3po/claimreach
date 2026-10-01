import { NETFLY_ANSWER_KEY, NETFLY_CAMPAIGN } from './netfly-ontake';
import { type LrOriginal, type LrDocumentScope, recordLawRulerSource, storeLawRulerOriginals } from './lawruler-documents';

const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

// NETFLY's full Summary is the original narrative. These separately mapped
// LawRuler answers stay source-attributed so a missing heading in Summary does
// not silently discard an answer collected by the first intake.
export const NETFLY_SOURCE_FIELD_MAP = [
  ['Marketing source', 'marketingsource', 'leadprovider'],
  ['Accident date', 'accidentdate', 'default41'],
  ['Accident location', 'accidentlocation', 'custom4148'],
  ['Accident city', 'accidentcity', 'custom4174'],
  ['Accident state', 'accidentstate', 'custom4175'],
  ['Case number', 'casenumber', 'custom4149'],
  ['Airbags deployed', 'airbagsdeployed', 'custom4172'],
  ['Passengers', 'passengers', 'custom4173'],
  ['Accident narrative', 'accidentnarrative', 'custom4155'],
  ['Injuries and treatment', 'injuriesandtreatment', 'custom4169'],
  ['Current attorney', 'currentattorney', 'custom4170'],
  ['Next steps', 'nextsteps', 'custom4171'],
] as const;

export function netflySourceFields(fields: Record<string, unknown>): Record<string, string> {
  const input = new Map(Object.entries(fields).map(([name, value]) => [key(name), value]));
  const mapped: Record<string, string> = {};
  for (const [label, ...aliases] of NETFLY_SOURCE_FIELD_MAP) {
    for (const alias of aliases) {
      const raw = input.get(alias);
      const value = typeof raw === 'string' ? raw.trim() : '';
      if (!value || /\{\{[^}]+\}\}/.test(value)) continue;
      mapped[label] = value;
      break;
    }
  }
  return mapped;
}

export function netflyHandoffNote(fields: Record<string, unknown>): string {
  const values = ['netflyhandoffnote', 'summary', 'casedescription', 'default27'].map(name =>
    Object.entries(fields).find(([field]) => key(field) === name)?.[1]);
  for (const raw of values) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value.length >= 10 && !/^\{\{[^}]+\}\}(?:\s*[-–].*)?$/i.test(value)) return value;
  }
  return '';
}

export function validateNetflyLawRulerPayload(fields: Record<string, unknown>, files: LrOriginal[], _firstArrival: boolean): string | null {
  const note = netflyHandoffNote(fields);
  if (note.length > 20_000) return 'The NETFLY handoff note is too long.';
  if (Object.values(netflySourceFields(fields)).some(value => value.length > 20_000)) return 'A NETFLY source answer is too long.';
  if (files.length > 1) return 'Send only the signed-retainer PDF in the NETFLY webhook document category.';
  for (const file of files) {
    if (!file.name || file.name.length > 240 || /[/\\]/.test(file.name)) return 'The signed-retainer filename is invalid.';
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
  const rawNote = netflyHandoffNote(fields);
  const note = rawNote.length >= 10 ? rawNote : '';
  const incomingSourceFields = netflySourceFields(fields);
  let revisions = 0, fieldRevisions = 0;
  if (!note && !Object.keys(incomingSourceFields).length) {
    const read = await db.from('claims').select('answers').eq('id', scope.claimId).eq('firm_id', scope.firmId).single();
    if (read.error) throw new Error('Could not check the NETFLY handoff; retry this webhook.');
    revisions = Array.isArray(read.data?.answers?.[NETFLY_ANSWER_KEY]?.handoffs)
      ? read.data.answers[NETFLY_ANSWER_KEY].handoffs.length : 0;
    fieldRevisions = Array.isArray(read.data?.answers?.[NETFLY_ANSWER_KEY]?.source_field_revisions)
      ? read.data.answers[NETFLY_ANSWER_KEY].source_field_revisions.length : 0;
  }
  if (note || Object.keys(incomingSourceFields).length) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const read = await db.from('claims').select('answers, updated_at').eq('id', scope.claimId).eq('firm_id', scope.firmId).single();
      if (read.error || !read.data) throw new Error('Could not read the NETFLY handoff; retry this webhook.');
      const answers = read.data.answers && typeof read.data.answers === 'object' ? read.data.answers : {};
      const current = answers[NETFLY_ANSWER_KEY] && typeof answers[NETFLY_ANSWER_KEY] === 'object' ? answers[NETFLY_ANSWER_KEY] : {};
      const handoffs = Array.isArray(current.handoffs) ? current.handoffs : [];
      const sourceFieldRevisions = Array.isArray(current.source_field_revisions) ? current.source_field_revisions : [];
      const priorFields = sourceFieldRevisions.at(-1)?.fields || {};
      const mergedFields = { ...priorFields, ...incomingSourceFields };
      const sameNote = !note || (typeof handoffs.at(-1)?.note === 'string' &&
        handoffs.at(-1).note.replace(/\r\n/g, '\n') === note.replace(/\r\n/g, '\n') && handoffs.at(-1)?.source_id === scope.vendorId);
      const sameFields = !Object.keys(incomingSourceFields).length || JSON.stringify(mergedFields) === JSON.stringify(priorFields);
      revisions = handoffs.length; fieldRevisions = sourceFieldRevisions.length;
      if (sameNote && sameFields) break;
      if (!sameNote && handoffs.length >= 20) throw new Error('NETFLY handoff revision limit reached; supervisor review needed.');
      if (!sameFields && sourceFieldRevisions.length >= 50) throw new Error('NETFLY source-field revision limit reached; supervisor review needed.');
      const next = { ...answers, [NETFLY_ANSWER_KEY]: { ...current, version: 1,
        handoffs: sameNote ? handoffs : [...handoffs, { note, at: new Date().toISOString(), by: 'lawruler', by_name: 'LawRuler / NETFLY', channel: 'lawruler', source_id: scope.vendorId }],
        source_field_revisions: sameFields ? sourceFieldRevisions : [...sourceFieldRevisions, { fields: mergedFields, at: new Date().toISOString(), source_id: scope.vendorId }],
        review: { ...(current.review || {}), status: 'in_progress' } } };
      const saved = await db.from('claims').update({ answers: next, updated_at: new Date().toISOString() })
        .eq('id', scope.claimId).eq('firm_id', scope.firmId).eq('updated_at', read.data.updated_at).select('id').maybeSingle();
      if (saved.error) throw new Error(`NETFLY handoff could not be saved: ${saved.error.message}`);
      if (saved.data) { revisions = handoffs.length + Number(!sameNote); fieldRevisions = sourceFieldRevisions.length + Number(!sameFields); break; }
      if (attempt === 3) throw new Error('NETFLY handoff changed during import; retry this webhook.');
    }
  }
  return { originals, handoff_revisions: revisions, source_field_revisions: fieldRevisions, source_campaign: NETFLY_CAMPAIGN };
}
