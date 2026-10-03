import { NETFLY_ANSWER_KEY, NETFLY_FIELD_IDS } from './netfly-ontake';
import { extractNetflyEmail, handoffFirmMatches, handoffFirmNames, planHandoffFields } from './netfly-handoff';
import { joinUsAddress, mailColumnsFrom } from './us-address';

type Scope = { firmId: string; campaignId: string; claimId: string; leadId: string };
type Source = { by: string; by_name: string; channel: string; source_id?: string };

/** Check declared routing against the already-authorized firm before any write. */
export async function assertHandoffFirm(db: any, firmId: string, note: string) {
  const declared = handoffFirmNames(note);
  if (!declared.length) return; // Missing information can remain a partial file.
  const result = await db.from('firms').select('name, slug').eq('id', firmId).maybeSingle();
  if (result.error || !result.data?.name) throw new Error('Could not verify the receiving firm. Nothing was imported.');
  if (declared.some(name => !handoffFirmMatches(name, result.data)))
    throw new Error('The handoff names a different or unrecognized law firm. Nothing was imported. Ask a supervisor to verify the destination.');
}

/** Append source evidence and fill selected blanks with an optimistic lock. */
export async function saveNetflyHandoff(db: any, scope: Scope, note: string, selected: string[], source: Source) {
  if (note.trim().length < 10 || note.length > 20000) throw new Error('Paste an email or note between 10 and 20,000 characters.');
  await assertHandoffFirm(db, scope.firmId, note);
  const extracted = extractNetflyEmail(note);
  for (let attempt = 0; attempt < 4; attempt++) {
    const contact = await db.from('leads').select('claimant_name, phone, email, dob, mail_addr1, mail_city, mail_state, mail_zip')
      .eq('id', scope.leadId).eq('firm_id', scope.firmId).eq('campaign_id', scope.campaignId).is('archived_at', null).single();
    if (contact.error || !contact.data) throw new Error('Could not check the client contact. Nothing was imported.');
    const lead = contact.data;
    const read = await db.from('claims').select('answers, updated_at')
      .eq('id', scope.claimId).eq('lead_id', scope.leadId).eq('firm_id', scope.firmId).eq('campaign_id', scope.campaignId).single();
    if (read.error || !read.data) throw new Error('Could not check the current file. Your email was not applied.');
    const all = read.data.answers || {};
    const current = all[NETFLY_ANSWER_KEY] || {};
    const handoffs = Array.isArray(current.handoffs) ? current.handoffs : [];
    const same = handoffs.some((h: any) => h.note === note && (!source.source_id || h.source_id === source.source_id));
    if (!same && handoffs.length >= 20) throw new Error('Handoff revision limit reached. Ask a supervisor to review the file.');
    const contactFields = { confirmed_name: lead.claimant_name || '', confirmed_phone: lead.phone || '',
      confirmed_email: lead.email || '', dob: lead.dob || '',
      mailing_address: joinUsAddress({ street: lead.mail_addr1, city: lead.mail_city, state: lead.mail_state, zip: lead.mail_zip }) };
    const existing = { ...(current.fields || {}) };
    for (const [id, value] of Object.entries(contactFields)) if (value) existing[id] ||= value;
    const plan = planHandoffFields(note, existing, selected.filter(id => NETFLY_FIELD_IDS.has(id)));
    const at = new Date().toISOString();
    const provenance = { ...(current.imported_fields || {}) };
    for (const [id, value] of Object.entries(plan.fields)) provenance[id] = { value, at, ...source, confirmed: false };
    const next = { ...all, [NETFLY_ANSWER_KEY]: { ...current, version: 1,
      handoffs: same ? handoffs : [...handoffs, { note, at, ...source }],
      fields: { ...(current.fields || {}), ...plan.fields }, imported_fields: provenance,
      review: { ...(current.review || {}), ...(!same || Object.keys(plan.fields).length ? { status: 'in_progress' } : {}) },
    } };
    const saved = await db.from('claims').update({ answers: next, updated_at: at })
      .eq('id', scope.claimId).eq('firm_id', scope.firmId).eq('campaign_id', scope.campaignId)
      .eq('updated_at', read.data.updated_at).select('id').maybeSingle();
    if (saved.error) throw new Error('The email could not be saved. Retry with the same email.');
    if (saved.data) {
      // Retrying after a contact-write failure can finish the same blank-only
      // update. Never replace a contact value another agent has already saved.
      const imported = next[NETFLY_ANSWER_KEY].imported_fields;
      for (const [id, column] of [['confirmed_phone', 'phone'], ['confirmed_email', 'email'], ['dob', 'dob'], ['mailing_address', 'mail_addr1']]) {
        const value = extracted.fields[id];
        if (!selected.includes(id) || !value || lead[column] || imported[id]?.value !== value) continue;
        const patch = id === 'mailing_address' ? mailColumnsFrom(lead, value) : { [column]: value };
        if (!patch) continue;
        let update = db.from('leads').update(patch).eq('id', scope.leadId).eq('firm_id', scope.firmId).eq('campaign_id', scope.campaignId);
        for (const changed of Object.keys(patch)) update = lead[changed] == null ? update.is(changed, null) : update.eq(changed, lead[changed]);
        const result = await update.select('id').maybeSingle();
        if (result.error) throw new Error('Email saved, but a contact detail did not update. Retry this same email.');
        if (!result.data) throw new Error('Email saved, but the contact changed during import. Refresh and review the contact before calling.');
      }
      return { applied: Object.keys(plan.fields), skipped: plan.skipped, revisions: handoffs.length + Number(!same), extracted };
    }
  }
  throw new Error('Another agent updated this file. Refresh and retry; existing answers were kept.');
}
