import { sendEmail } from './email';
import { declineOutcome, dropLetterMessage, SIGNED_DECLINE_EVENT, type SignedDecline } from './signed-decline';

type Context = { db: any; claim: any; lead: any; to: string; decline: SignedDecline };
/** This receipt is deliberately NOT a firm_deliveries row. A drop request is
 * not packet delivery and must never start/reset the seven-day clock. */
export async function readDropRequest(db: any, claim: any, id: string) {
  const r = await db.from('lead_activity').select('id,meta,created_at').eq('id', id)
    .eq('firm_id', claim.firm_id).eq('lead_id', claim.lead_id).eq('meta->>claim_id', claim.id)
    .eq('meta->>event', SIGNED_DECLINE_EVENT).maybeSingle();
  if (r.error) throw new Error('Could not verify the drop-letter email receipt. Do not resend yet.');
  return r.data;
}
export async function notifySignedDecline(c: Context, retry: boolean, send = sendEmail) {
  let receipt = await readDropRequest(c.db, c.claim, c.decline.id);
  let acquired = false;
  if (!receipt) {
    const meta = { event: SIGNED_DECLINE_EVENT, claim_id: c.claim.id, campaign_id: c.claim.campaign_id,
      state: 'sending', to: c.to, ...dropLetterMessage(c.lead.claimant_name || 'Client', c.lead.lead_no || 'File', c.decline.reason,
        [`Phone: ${c.lead.phone || 'Not recorded'}`, `Email: ${c.lead.email || 'Not recorded'}`,
          `Mailing address: ${[c.lead.mail_addr1, c.lead.mail_city, c.lead.mail_state, c.lead.mail_zip].filter(Boolean).join(', ') || 'Not recorded'}`].join('\n'), declineOutcome(c.decline)),
      attempt: 1, started_at: new Date().toISOString(), provider_id: null, error: null };
    // Unique activity ID is the durable reservation. Two concurrent requests
    // cannot send twice, even after the provider's idempotency window expires.
    const r = await c.db.from('lead_activity').insert({ id: c.decline.id, firm_id: c.claim.firm_id,
      lead_id: c.claim.lead_id, kind: 'note', actor: c.decline.actorType === 'firm' ? null : c.decline.actorId,
      body: `${declineOutcome(c.decline)} — ${c.decline.reason}. Drop letter requested from the firm.`, meta }).select('id,meta').single();
    if (r.error?.code === '23505') receipt = await readDropRequest(c.db, c.claim, c.decline.id);
    else if (r.error || !r.data) throw new Error('The file is declined, but the email request could not be saved. Retry the request here.');
    else { receipt = r.data; acquired = true; }
  } else if (receipt.meta.state === 'failed' && retry) {
    const meta = { ...receipt.meta, state: 'sending', attempt: receipt.meta.attempt + 1, started_at: new Date().toISOString(), error: null };
    const r = await c.db.from('lead_activity').update({ meta }).eq('id', c.decline.id).eq('firm_id', c.claim.firm_id)
      .eq('lead_id', c.claim.lead_id).eq('meta->>claim_id', c.claim.id).eq('meta->>state', 'failed')
      .eq('meta->>attempt', String(receipt.meta.attempt)).select('id,meta').maybeSingle();
    if (r.error) throw new Error('Could not reserve the email retry. Nothing was sent.');
    if (r.data) { receipt = r.data; acquired = true; }
    else receipt = await readDropRequest(c.db, c.claim, c.decline.id);
  }
  if (!acquired) return receipt?.meta || { state: 'uncertain' };
  // Keep the payload/recipient frozen on retry. The owner sees this exact
  // recipient; changing campaign settings cannot redirect an old request.
  let result: Awaited<ReturnType<typeof sendEmail>>;
  try { result = await send({ to: receipt.meta.to, subject: receipt.meta.subject, html: receipt.meta.html,
    idempotencyKey: `signed-drop-${c.decline.id}-${receipt.meta.attempt}` }); }
  catch { result = { ok: false, uncertain: true, error: 'The email result could not be confirmed.' }; }
  const meta = { ...receipt.meta, state: result.ok ? 'sent' : result.uncertain ? 'uncertain' : 'failed',
    provider_id: result.providerId || null, finished_at: new Date().toISOString(), error: result.error || null };
  const saved = await c.db.from('lead_activity').update({ meta }).eq('id', c.decline.id).eq('firm_id', c.claim.firm_id)
    .eq('lead_id', c.claim.lead_id).eq('meta->>claim_id', c.claim.id).eq('meta->>state', 'sending')
    .eq('meta->>attempt', String(receipt.meta.attempt)).select('id').maybeSingle();
  if (saved.error || !saved.data) throw new Error('The file is declined. The email result could not be saved; check Resend before any retry.');
  return meta;
}
