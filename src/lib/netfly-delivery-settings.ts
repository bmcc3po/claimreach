import type { GatedUser } from './gate';

// Keep recipient validation identical in settings and the final packet review.
export const validDeliveryEmail = (value: string) => value.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
export function netflyFirmEmailProblem(value: string): string | null {
  if (!validDeliveryEmail(value)) return 'Enter one valid firm delivery email address.';
  if (value === 'bmc@innovativeintake.com') return 'Use a separate firm delivery address. Brett already receives a copy.';
  return null;
}

// Campaign configuration remains owner-only during the staff pilot.
export const canEditNetflyDelivery = (actor: GatedUser) => actor.role === 'owner' && actor.can('settings.manage');
