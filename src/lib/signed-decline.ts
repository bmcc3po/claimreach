/** A signed disqualification is terminal; the signature and delivery stay intact. */
export const SIGNED_DECLINE_STATUS = 'signed_dropped';
export const SIGNED_DECLINE_EVENT = 'signed_file_drop_request';
export type SignedDecline = {
  id: string; at: string; reason: string; actorId: string; actorName: string;
  agentId: string | null; agentName: string; previousStatus: string;
};
export function signedDecline(claim: any): SignedDecline | null {
  const d = claim?.answers?.signed_decline;
  return isSignedDeclined(claim) && d && typeof d.id === 'string' && typeof d.reason === 'string' && typeof d.at === 'string' ? d : null;
}
export function isSignedDeclined(claim: any): boolean {
  return claim?.status === SIGNED_DECLINE_STATUS;
}
/** Form saves may neither invent nor erase owner workflow evidence. */
export function preserveDeclineEvidence(next: any, current: any) {
  const answers = { ...(next && typeof next === 'object' && !Array.isArray(next) ? next : {}) };
  delete answers.signed_decline;
  if (current?.signed_decline) answers.signed_decline = current.signed_decline;
  return answers;
}
export const DROP_EMAIL_STATES = ['sending', 'sent', 'failed', 'uncertain'] as const;
export type DropEmailState = typeof DROP_EMAIL_STATES[number];
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
export function dropLetterMessage(name: string, number: string, reason: string, contact = '') {
  return {
    subject: `Drop letter requested: ${number.replace(/[\r\n]/g, ' ')} — ${name.replace(/[\r\n]/g, ' ')}`,
    html: `<p>Hello,</p><p>Please review this signed INNO MVA file and send the client the appropriate drop letter.</p><p><strong>Client:</strong> ${escape(name)}<br><strong>File:</strong> ${escape(number)}</p><p>${escape(contact).replace(/\n/g, '<br>')}</p><p><strong>Reason:</strong><br>${escape(reason).replace(/\n/g, '<br>')}</p><p>ClaimReach has marked this file declined. This email requests action by the firm; it does not confirm that a drop letter has been sent to the client. Please reply when completed.</p><p>Innovative Intake</p>`,
  };
}
