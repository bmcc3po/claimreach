"use client";

import { PassengerDetails, type IntakePresentation } from "./IntakeQuestion";
import PassengerAgreement from "./PassengerAgreement";

/** Caller first: capture and sign each passenger from the same Retainer block. */
export default function PassengerFollowup({ v, presentation = "full" }: { v: any; presentation?: IntakePresentation }) {
  if (!v.signed || !v.passengersPresent) return null;
  return <section className="cc-card ch-wide" aria-label="Passenger details and agreements">
    <h3>Now, let’s help the passengers</h3>
    <PassengerDetails c={{ people: v.people, add: v.addPerson }} v={v} presentation={presentation}
      agreement={(person) => <PassengerAgreement p={(v.paxSend || []).find((p: any) => p.id === person.id)} v={v} capture={false} />} />
  </section>;
}
