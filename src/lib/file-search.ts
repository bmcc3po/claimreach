import { NETFLY_CAMPAIGN } from './netfly-ontake';
import { mayOpenFullFile } from './file-fence';
export function fileSearchMatch(query: any, text: string) {
  const q = text.trim().slice(0, 80), digits = q.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (digits.length === 10) return query.eq('phone_norm', digits);
  if (/^(?:[a-z]{0,6}-?|NF-TMP)\d{2,}$/i.test(q)) return query.or(`lead_no.ilike.%${q}%,lead_no_aliases.cs.{${q.toUpperCase()}}`);
  const safe = q.replace(/[%_,()\\]/g, ' ').trim();
  return safe.length >= 2 ? query.ilike('claimant_name', `%${safe}%`) : query.eq('id', '00000000-0000-0000-0000-000000000000');
}
export function fileSearchRows(leads: any[], claims: any[], role: string, netfly = false) {
  return leads.flatMap(lead => {
    if (lead.archived_at) return [];
    const own = claims.filter(c => c.lead_id === lead.id && c.firm_id === lead.firm_id);
    if (netfly && (own.length !== 1 || own[0].claim_type !== 'mva' || own[0].campaign_id !== lead.campaign_id)) return [];
    const eligible = own.filter(c => netfly || c.campaign !== NETFLY_CAMPAIGN);
    if (!eligible.length) return [];
    if (!mayOpenFullFile(role) && !netfly && eligible.some(c => c.claim_type !== 'mva')) return [];
    const claim = eligible.length === 1 ? eligible[0] : null;
    const base = netfly ? '/app/netfly' : mayOpenFullFile(role) ? '/leads' : '/app';
    return [{ id: lead.id, lead_no: lead.lead_no, claimant_name: lead.claimant_name, phone: lead.phone,
      campaign: netfly ? NETFLY_CAMPAIGN : claim?.campaign || lead.campaign,
      status: claim?.status || null, updated_at: lead.updated_at,
      href: `${base}/${encodeURIComponent(lead.id)}${claim && !netfly ? `?claim=${encodeURIComponent(claim.id)}` : ''}` }];
  });
}
export function mergeFileSearchRows(rows: any[]) {
  const unique = new Map<string, any>();
  for (const row of rows) if (!unique.has(row.id) || row.href.startsWith('/app/netfly/')) unique.set(row.id, row);
  return [...unique.values()].sort((a,b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || a.id.localeCompare(b.id)).slice(0,30);
}
