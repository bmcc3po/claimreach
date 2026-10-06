import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase-server';
import { gateUser } from '@/lib/gate';
import { reviewerProfileAllowed, uuid } from '@/lib/firm-review-access';
export const runtime = 'edge';
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET() {
  const me = await gateUser(await supabaseServer());
  if (me?.role !== 'owner') return json({ error: 'Sign in as the owner to set up firm access.' }, 403);
  const result = await supabaseAdmin().from('campaigns').select('id,name,firm_id').order('name');
  if (result.error) return json({ error: 'Could not load campaigns.' }, 503);
  return json({ campaigns: result.data });
}
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return json({ error: 'Please refresh before saving.' }, 403);
  const me = await gateUser(await supabaseServer());
  if (me?.role !== 'owner') return json({ error: 'Only the owner can grant firm access.' }, 403);
  const body = await req.json().catch(() => null);
  const email = String(body?.email || '').trim().toLowerCase(), name = String(body?.name || '').trim();
  if (!uuid(body?.campaign) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 120) return json({ error: 'Enter a name, work email and campaign.' }, 400);
  const db = supabaseAdmin();
  const [campaign, profile, access] = await Promise.all([
    db.from('campaigns').select('id,name,firm_id').eq('id', body.campaign).maybeSingle(),
    db.from('app_users').select('id,role,active,firm_id,perm_overrides').ilike('email', email).limit(2),
    db.from('firm_access').select('email').ilike('email', email).limit(1),
  ]);
  if (campaign.error || !campaign.data?.firm_id || profile.error || access.error) return json({ error: 'Could not verify access. Nothing was changed.' }, 503);
  if (access.data?.length || (profile.data?.length || 0) > 1) return json({ error: 'This email has other system access that needs administrator review before restriction.' }, 409);
  const oldProfile = profile.data?.[0] || null;
  // Existing general firm accounts can be explicitly narrowed by an owner.
  // Staff, partners and already-restricted different scopes are never converted.
  let existing: any = null;
  for (let page = 1; page <= 20; page++) {
    const result = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) return json({ error: 'Could not verify the account inventory.' }, 503);
    existing = result.data.users.find(u => u.email?.toLowerCase() === email);
    if (existing || result.data.users.length < 1000) break;
    if (page === 20) return json({ error: 'Account inventory needs administrator review.' }, 503);
  }
  const scope = { email, name, active: true, firm_id: campaign.data.firm_id, campaign_id: campaign.data.id };
  if (existing) {
    const old = existing.app_metadata?.firm_review;
    if (existing.app_metadata?.account_type === 'firm_review' && old?.active === true && old.email === email && old.firm_id === scope.firm_id && old.campaign_id === scope.campaign_id && reviewerProfileAllowed(existing, oldProfile)) return json({ ok: true, email, existing: true });
    if (body?.restrict_existing === true && !existing.app_metadata?.account_type && oldProfile?.id === existing.id && oldProfile.role === 'firm') {
      const audit = await db.from('audit_log').insert({ firm_id: scope.firm_id, actor: me.id, actor_name: me.name,
        category: 'system', description: 'Owner requested restriction of an existing firm login to one campaign inbox.',
        meta: { event: 'firm_reviewer_restriction', reviewer_id: existing.id, email, campaign_id: scope.campaign_id,
          previous_profile: oldProfile } });
      if (audit.error) return json({ error: 'Could not record the access change. Nothing was changed.' }, 503);
      // Retire general access first. A later failure leaves it disabled, never
      // silently restored. No profile, password, client or history is deleted.
      const retired = await db.from('app_users').update({ active: false }).eq('id', existing.id).eq('role', 'firm').select('id').maybeSingle();
      if (retired.error || !retired.data) return json({ error: 'Could not restrict the general firm profile. Refresh and review this account.' }, 503);
      const changed = await db.auth.admin.updateUserById(existing.id, { app_metadata: { ...existing.app_metadata,
        account_type: 'firm_review', firm_review: { ...scope, retired_profile_id: existing.id },
        access_granted_by: me.id, access_granted_at: new Date().toISOString() } });
      if (changed.error || !changed.data.user) return json({ error: 'General firm access is disabled, but the restricted inbox is not ready. Retry this setup; the existing login is retained.' }, 503);
      return json({ ok: true, email, existing: true, restricted: true });
    }
    return json({ error: 'This email already has an account with different access. Nothing was changed.' }, 409);
  }
  if (oldProfile) return json({ error: 'The existing profile could not be matched to its login. Nothing was changed.' }, 409);
  const created = await db.auth.admin.createUser({ email, email_confirm: true, app_metadata: { account_type: 'firm_review', firm_review: scope,
    access_granted_by: me.id, access_granted_at: new Date().toISOString() } });
  if (created.error || !created.data.user) return json({ error: 'Could not create the account. Refresh before trying again.' }, 503);
  // No shared password, invitation email, app_users profile or firm_access row.
  // The recipient proves ownership of their mailbox via their sign-in link.
  return json({ ok: true, email });
}
