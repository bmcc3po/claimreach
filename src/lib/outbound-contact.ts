import { toE164 } from './justcall-send';
import type { GatedUser } from './gate';

/** Authorize the saved contact before any provider credential or send is used. */
export async function outboundContact(db: any, actor: GatedUser, leadId: unknown, destination: unknown, channel: 'Text' | 'Call') {
  if (!actor.can(channel === 'Text' ? 'messages.send' : 'calls.log')) return { error: 'You do not have permission to contact this file.', status: 403 } as const;
  if (typeof leadId !== 'string' || !leadId) return { error: 'Open a file before contacting the client.', status: 400 } as const;
  const { data: lead, error } = await db.from('leads').select('id,firm_id,phone,archived_at,perm_text,perm_call,comms_monitored,comms_safe_channels').eq('id', leadId).maybeSingle();
  if (error) return { error: 'Could not verify contact access. Nothing was sent.', status: 503 } as const;
  if (!lead) return { error: 'File not found.', status: 404 } as const;
  if (lead.archived_at || lead[channel === 'Text' ? 'perm_text' : 'perm_call'] !== true) return { error: `${channel === 'Text' ? 'Texting' : 'Calling'} is disabled for this file.`, status: 409 } as const;
  const to = toE164(lead.phone);
  if (!to) return { error: 'Save a valid phone number on this file first.', status: 400 } as const;
  if (destination != null && (typeof destination !== 'string' || toE164(destination) !== to)) return { error: 'The phone number changed. Save the client’s contact details, then try again.', status: 409 } as const;
  if (lead.comms_monitored && (!Array.isArray(lead.comms_safe_channels) || !lead.comms_safe_channels.includes(channel))) return { error: `${channel} is not a safe channel for this client.`, status: 409 } as const;
  const points = await db.from('contact_points').select('status,value').eq('lead_id', lead.id).in('kind', ['mobile','landline']).is('retired_at', null);
  if (points.error) return { error: 'Could not verify opt-out status. Contact held.', status: 503 } as const;
  if ((points.data || []).some((p: any) => p.status === 'opted_out' && toE164(p.value) === to)) return { error: 'This number opted out. Do not contact it.', status: 409 } as const;
  return { lead, to } as const;
}
