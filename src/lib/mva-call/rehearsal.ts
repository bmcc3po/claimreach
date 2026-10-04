import type { Packet } from '@/lib/esign-packets/tmp-mva';
import { paxParentId } from '@/lib/linked-files';
import { toE164 } from '@/lib/justcall-send';

// Only owner-created template rows designate a rehearsal. A TEST name alone
// never selects a template. Separate keys cannot replace a campaign's real PDFs.
export const REHEARSAL_NAME = 'ClaimReach NONBINDING signing rehearsal v1';
export const rehearsalRoot = (lead: { id: string; external_id?: string | null }) => paxParentId(lead.external_id) || lead.id;
export const rehearsalKey = (root: string) => `REHEARSAL_${root}_OTHER`;
export function rehearsalTemplates<T extends { key: string; name?: string }>(rows: T[], lead: { id: string; external_id?: string | null }) {
  const selected = rows.find(row => row.key === rehearsalKey(rehearsalRoot(lead)));
  return { rehearsal: !!selected, templates: selected ? [{ ...selected, key: 'OTHER' }] : rows.filter(row => !row.key.startsWith('REHEARSAL_')) };
}
export const syntheticName = (name: unknown) => /^TEST(?:\s|$)/i.test(String(name || '').trim());
export function rehearsalRecipientAllowed(config: any, via: string, destination: string): boolean {
  if (config?.version !== 1) return false;
  if (via === 'Text') {
    const phone = toE164(destination);
    return !!phone && /^\+[1-9]\d{9,14}$/.test(phone) && phone === toE164(config.phone);
  }
  return via === 'Email' && Array.isArray(config.emails) && config.emails.some((value: unknown) =>
    typeof value === 'string' && value.trim().toLowerCase() === destination.trim().toLowerCase());
}

export async function readRehearsal(db: any, lead: { id: string; external_id?: string | null; firm_id: string }, campaignId: string | null) {
  if (!campaignId) return null;
  const template = await db.from('esign_templates').select('key').eq('campaign_id', campaignId).eq('firm_id', lead.firm_id)
    .eq('provider', 'docuseal').eq('key', rehearsalKey(rehearsalRoot(lead))).maybeSingle();
  if (template.error) throw new Error('Could not verify whether this is a nonbinding test file.');
  if (!template.data) return null;
  const root = await db.from('leads').select('vendor_fields').eq('id', rehearsalRoot(lead)).eq('firm_id', lead.firm_id).eq('campaign_id', campaignId).maybeSingle();
  const config = root.data?.vendor_fields?.signing_rehearsal;
  if (root.error || config?.version !== 1) throw new Error('The approved rehearsal contacts could not be verified.');
  return config;
}

const area = (page: number, y: number, h = 0.025) => ({ page, x: 0.12, y, w: 0.76, h });
const text = (name: string, page: number, y: number, role = 'Client') => ({ name, type: 'text', role,
  required: name !== 'Patient SSN', readonly: role === 'Client', areas: [area(page, y)] });
export const REHEARSAL_PACKET: Packet = {
  name: REHEARSAL_NAME, external_id: 'claimreach-nonbinding-rehearsal-v1',
  path: '/esign-src/nonbinding-rehearsal-v1.pdf',
  fields: [
    text('Client Name', 1, 0.30), text('Injured Party Name', 1, 0.38),
    text('Accident Date', 1, 0.46), text('Signing Date', 1, 0.54),
    { name: 'Client Signature', type: 'signature', role: 'Client', required: true,
      areas: [area(1, 0.64, 0.055), area(2, 0.64, 0.055), area(3, 0.64, 0.055)] },
    text('Patient DOB', 2, 0.38, 'Intake'), text('Patient SSN', 2, 0.46, 'Intake'), text('Firm Date', 3, 0.46, 'Intake'),
  ],
};
