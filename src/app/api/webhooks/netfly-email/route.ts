import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { cappedBytes, emailObjectId, receiveAllowed, resendGet, verifyResendWebhook, type ReceivedEmail } from '@/lib/resend-inbound';
import { importNetflyEmail, netflyEmailCampaign } from '@/lib/netfly-email-import';
import { emailPlainText, isNetflyCaseEmail } from '@/lib/netfly-handoff';
export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const secret = process.env.NETFLY_RESEND_WEBHOOK_SECRET || '';
  const recipient = process.env.NETFLY_RECEIVING_TO?.trim().toLowerCase() || '';
  const key = process.env.NETFLY_RESEND_API_KEY || '';
  if (!secret || !recipient || !key) return NextResponse.json({ error: 'NETFLY email receiving is not configured.' }, { status: 503 });
  let raw: string;
  try { raw = new TextDecoder().decode(await cappedBytes(req.body, 64 * 1024)); }
  catch { return NextResponse.json({ error: 'Webhook too large.' }, { status: 413 }); }
  if (!await verifyResendWebhook(raw, req.headers, secret)) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  let event: any;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid webhook.' }, { status: 400 }); }
  if (event.type !== 'email.received') return NextResponse.json({ ignored: true });
  const emailId = String(event.data?.email_id || '');
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(emailId)) return NextResponse.json({ error: 'Missing received email identity.' }, { status: 400 });
  const db = supabaseAdmin();
  let firmId: string | null = null;
  const logId = await emailObjectId(`netfly-resend-event|${emailId}`);
  try {
    const campaign = await netflyEmailCampaign(db); firmId = campaign.firm_id;
    const prior = await db.from('webhook_events').select('status, response').eq('id', logId).eq('firm_id', firmId).maybeSingle();
    if (prior.error) throw new Error('Could not check the email import receipt.');
    if (prior.data?.status === 'received') return NextResponse.json({ ok: true, already_saved: true });
    const email: ReceivedEmail = await resendGet(`/emails/receiving/${emailId}`, key);
    if (email.id !== emailId) throw new Error('Resend email identity did not match.');
    const domains = (process.env.NETFLY_EMAIL_FROM_DOMAINS || 'netflydigital.com,innovativeintake.com').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const forwarders = (process.env.NETFLY_EMAIL_FROM_ADDRESSES ?? 'bcurry@turnbullfirm.com').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const denied = receiveAllowed(email, recipient, domains, forwarders);
    if (denied === 'different_recipient') return NextResponse.json({ ignored: true, reason: denied });
    if (denied === 'unapproved_sender') {
      // A successful webhook response is not a successful file import. Keep
      // held mail visible without asking the provider to retry it endlessly.
      const receipt = { id: logId, firm_id: firmId, direction: 'inbound', event_type: 'netfly.email',
        status: 'failed', http_status: 200, created_at: new Date().toISOString(), payload: { email_id: emailId },
        response: JSON.stringify({ ignored: true, reason: denied }),
        error: 'Email received, but the forwarding address is not approved for NETFLY import. The original is in Resend for owner review.' };
      const logged = prior.data ? await db.from('webhook_events').update(receipt).eq('id', logId).eq('firm_id', firmId)
        : await db.from('webhook_events').insert(receipt);
      if (logged.error && logged.error.code !== '23505') throw new Error('Could not record the held email. Retry this event.');
      return NextResponse.json({ ignored: true, reason: denied });
    }
    if (denied) throw new Error('Sender authentication could not be verified. Email remains in Resend for review.');
    if (!isNetflyCaseEmail(email.subject || '', email.text?.trim() || emailPlainText(email.html || '')))
      return NextResponse.json({ ignored: true, reason: 'not_a_case_handoff' });
    const result = await importNetflyEmail(db, campaign, email, key);
    const receipt = { id: logId, firm_id: firmId, direction: 'inbound', event_type: 'netfly.email',
      status: result.retry_required ? 'failed' : 'received', http_status: result.retry_required ? 503 : 200, created_at: new Date().toISOString(),
      payload: { email_id: emailId, lead_id: result.lead_id, claim_id: result.claim_id, partial: result.partial },
      response: JSON.stringify({ lead_no: result.lead_no, partial: result.partial }), error: result.retry_required ? 'PDF import incomplete. Retry this event.' : null };
    const logged = prior.data ? await db.from('webhook_events').update(receipt).eq('id', logId).eq('firm_id', firmId) : await db.from('webhook_events').insert(receipt);
    if (logged.error && logged.error.code !== '23505') throw new Error('File imported but the receipt failed. Retry this event.');
    return NextResponse.json({ ok: !result.retry_required, ...result }, { status: result.retry_required ? 503 : 200 });
  } catch (error: any) {
    // Operational log contains provider IDs, never medical narratives or PDFs.
    const log = await db.from('webhook_events').insert({ firm_id: firmId, direction: 'inbound', event_type: 'netfly.email.failed',
      status: 'failed', http_status: 503, payload: { email_id: emailId }, error: String(error.message || 'Email import failed').slice(0, 500) });
    return NextResponse.json({ error: String(error.message || 'Email import failed'), retry_required: true, receipt_saved: !log.error }, { status: 503 });
  }
}
