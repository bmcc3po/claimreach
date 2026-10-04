/** Provider-confirmed client signatures; office completion may follow later. */
export const clientSignatureConfirmed = (status: unknown) => status === 'signed' || status === 'completed';

export const CALLER_FIRST = 'Finish and verify the caller’s signature first. Passenger agreements come next in Retainer.';

/** Keep one signing conversation active. Passenger capture never blocks the caller. */
export function passengerSigningWait(primaryStatus: unknown, superseded: boolean, people: any[], statuses: Record<string, string>, index: number): string {
  if (!clientSignatureConfirmed(primaryStatus) || superseded) return CALLER_FIRST;
  const earlier = people.findIndex((person, i) => i < index && person.hurt === 'Yes' && person.wantsRep === 'Yes' && !clientSignatureConfirmed(statuses[i]));
  return earlier < 0 ? '' : `Finish and verify ${people[earlier].name || `passenger ${earlier + 1}`}’s signature first.`;
}
