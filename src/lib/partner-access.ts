// A marketing partner is an external identity, never an internal or firm user.
// Auth app_metadata is set only by the service role; user_metadata is ignored.
export function isPartnerIdentity(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.account_type === 'partner';
}

export function partnerMayUsePath(path: string): boolean {
  return path === '/partner' || path.startsWith('/partner/') ||
    path === '/partner-login' || path.startsWith('/auth/');
}

export interface PartnerSourceRef {
  partner_key: string;
  source_system: string;
  source_lead_id: string;
  firm_id: string;
}

export interface PartnerLeadRef {
  firm_id: string;
  lawruler_ref_no?: string | null;
  external_id?: string | null;
  source_system?: string | null;
}

// The allowlist is the authority. A marketing-source string, phone match,
// campaign, or caller-supplied lead number can never grant access.
export function sourceRefMatchesLead(ref: PartnerSourceRef, lead: PartnerLeadRef): boolean {
  return ref.source_system === 'lawruler' && lead.source_system === 'lawruler' &&
    ref.firm_id === lead.firm_id && ref.source_lead_id === lead.lawruler_ref_no;
}

export function speedToLeadMinutes(receivedAt: string | null | undefined, firstDialedAt: string | null | undefined): number | null {
  if (!receivedAt || !firstDialedAt) return null;
  const start = Date.parse(receivedAt), end = Date.parse(firstDialedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 60000);
}
