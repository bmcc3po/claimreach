import { APP_CASE_TYPES } from './mva-call/links';
import { NETFLY_ANSWER_KEY, NETFLY_CAMPAIGN } from './netfly-ontake';

/** NETFLY is an MVA campaign; its answer namespace is not its database case type. */
export function isNetflyIntake(caseType?: string | null, campaign?: string | null): boolean {
  return caseType === NETFLY_ANSWER_KEY || (caseType === 'mva' && campaign === NETFLY_CAMPAIGN);
}

/** Choose a screen only. Each destination retains its own access and matter checks. */
export function currentIntakeHref(id: string, caseType?: string | null, campaign?: string | null): string | null {
  if (isNetflyIntake(caseType, campaign)) return `/app/netfly/${encodeURIComponent(id)}`;
  if (APP_CASE_TYPES.includes(caseType || '')) return `/app/${encodeURIComponent(id)}`;
  return null;
}
