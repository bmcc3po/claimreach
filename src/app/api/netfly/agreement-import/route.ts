import { NextRequest, NextResponse } from 'next/server';
import { netflyContext, netflyMatter } from '@/lib/netfly-server';
import { extractNetflyEmail } from '@/lib/netfly-handoff';
import { netflyAgreementPdf } from '@/lib/netfly-agreement-import';
import { preserveNetflySource } from '@/lib/netfly-email-import';
import { NETFLY_RETAINER_TYPE } from '@/lib/netfly-ontake';
export const runtime = 'edge';
export async function POST(req: NextRequest) {
  const ctx = await netflyContext();
  if (!ctx?.actor.can('docs.upload')) return NextResponse.json({ error: 'Document access is unavailable.' }, { status: 403 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const matter = await netflyMatter(ctx, String(body.file || ''));
  if (!matter) return NextResponse.json({ error: 'NETFLY file not found.' }, { status: 404 });
  const note = (matter.claim.answers as any)?.netfly_secondary?.handoffs?.at(-1)?.note || '';
  const links = extractNetflyEmail(note).agreementLinks;
  if (links.length !== 1) return NextResponse.json({ error: 'Save the NETFLY email with one matching agreement link first.' }, { status: 409 });
  try {
    const pdf = await netflyAgreementPdf(links[0], matter.lead.claimant_name);
    const id = await preserveNetflySource(ctx.db, { firmId: ctx.campaign.firm_id, campaignId: ctx.campaign.id, leadId: matter.lead.id, claimId: matter.claim.id }, pdf.filename, pdf.bytes, NETFLY_RETAINER_TYPE, 'application/pdf');
    return NextResponse.json({ ok: true, document_id: id });
  } catch (error: any) { return NextResponse.json({ error: error.message || 'Download failed. The file is saved; retry or upload the original PDF.' }, { status: 503 }); }
}
