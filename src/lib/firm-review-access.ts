// Restricted reviewers deliberately have NO app_users or firm_access entry.
// Only the Auth administrator can set app_metadata. Never trust user_metadata.
export const FIRM_REVIEW_HOME = '/firm-review';
export const FIRM_REVIEW_LOGIN = '/firm-review-login';
export const FIRM_REVIEW_API = '/api/firm-review';
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export type FirmReviewScope = { firmId: string; campaignId: string; name: string };
export function isFirmReviewer(user: any): boolean { return user?.app_metadata?.account_type === 'firm_review'; }
export function firmReviewScope(user: any): FirmReviewScope | null {
  const m = user?.app_metadata?.firm_review;
  if (!isFirmReviewer(user) || !user?.id || !user?.email || m?.active !== true ||
    m.email !== user.email.toLowerCase() || !uuid(m.firm_id) || !uuid(m.campaign_id)) return null;
  return { firmId: m.firm_id, campaignId: m.campaign_id, name: String(m.name || user.email) };
}
export function reviewerPathAllowed(path: string): boolean {
  return path === FIRM_REVIEW_HOME || path === FIRM_REVIEW_LOGIN || path.startsWith('/auth/');
}
export function releasedToReviewer(scope: FirmReviewScope, claim: any, lead: any): boolean {
  return !!claim && !!lead && claim.lead_id === lead.id && claim.firm_id === scope.firmId && lead.firm_id === scope.firmId &&
    claim.campaign_id === scope.campaignId && !lead.archived_at && ['delivered', 'retained'].includes(claim.status) &&
    !lead.vendor_fields?.signing_rehearsal && !/\b(TEST|TESTER|NONBINDING|REHEARSAL)\b/i.test(lead.claimant_name || '');
}
export const REVIEW_ACTIONS = ['received', 'accepted', 'turned_down'] as const;
export type ReviewAction = typeof REVIEW_ACTIONS[number];
export const REVIEW_LABELS: Record<ReviewAction, string> = { received: 'Received', accepted: 'Case Accepted', turned_down: 'Case Turn Down' };
export function reviewInput(body: any): { action: ReviewAction; explanation: string } | null {
  if (!REVIEW_ACTIONS.includes(body?.action)) return null;
  const explanation = typeof body.explanation === 'string' ? body.explanation.trim() : '';
  if (explanation.length > 5000 || body.action === 'turned_down' && !explanation) return null;
  return { action: body.action, explanation: body.action === 'turned_down' ? explanation : '' };
}
export function reviewState(events: any[]) {
  const valid = events.filter(e => REVIEW_ACTIONS.includes(e.meta?.action));
  const received = valid.find(e => e.meta.action === 'received');
  const decision = valid.find(e => e.meta.action !== 'received');
  return { receivedAt: received?.created_at || null, decision: decision?.meta.action || null,
    decisionAt: decision?.created_at || null, explanation: decision?.meta.explanation || '',
    reviewer: decision?.meta.reviewer_name || received?.meta.reviewer_name || '' };
}
