// NETFLY's signed-retainer secondary intake. This is deliberately separate
// from the INNO acquisition script and its mva_call answer namespace.
export const NETFLY_CAMPAIGN = "NETFLY ONTAKE";
export const NETFLY_ANSWER_KEY = "netfly_secondary";
export const NETFLY_RETAINER_TYPE = "netfly_signed_retainer";
export { activeCallPresence as activeNetflyCall } from "./call-presence";
export type { LiveCallPresence as NetflyLiveCall } from "./call-presence";
export const NETFLY_COMPLETIONS = ["complete", "incomplete"] as const;
export const NETFLY_DISPOSITIONS = ["appears_qualified", "appears_dq", "callback_to_finish", "client_remorse"] as const;
export const NETFLY_DQ_REASONS = ["sol", "diagnosis", "already_rep", "criteria", "prior_signup", "location", "duplicate", "other"] as const;
export const NETFLY_TRANSFER_OUTCOMES = ["connected", "attempted_no_answer", "client_declined", "not_attempted"] as const;
export type NetflyCallClose = {
  closeout_version?: 2;
  completion: (typeof NETFLY_COMPLETIONS)[number];
  disposition: (typeof NETFLY_DISPOSITIONS)[number];
  dq_reason_key: string;
  assessment_reason: string;
  transfer_destination: string;
  transfer_outcome: (typeof NETFLY_TRANSFER_OUTCOMES)[number];
  transfer_note: string;
  client_notified_48_business_hours: boolean;
  callback_promised_24_48_hours?: boolean;
};
export function validateNetflyCallClose(value: NetflyCallClose): string | null {
  if (!NETFLY_COMPLETIONS.includes(value.completion)) return "Choose whether the ontake is complete.";
  if (!NETFLY_DISPOSITIONS.includes(value.disposition)) return "Choose the call outcome.";
  if (value.disposition === "appears_qualified" && value.completion !== "complete") return "Finish the ontake before marking it appears to qualify.";
  if (value.disposition === "callback_to_finish" && value.completion !== "incomplete") return "A callback to finish requires an incomplete ontake.";
  if (value.disposition === "appears_dq" && !NETFLY_DQ_REASONS.includes(value.dq_reason_key as typeof NETFLY_DQ_REASONS[number])) return "Choose a DQ reason for supervisor review.";
  if (["appears_dq", "callback_to_finish", "client_remorse"].includes(value.disposition) && value.assessment_reason.trim().length < 5)
    return "Briefly explain this outcome and the next step.";
  if (value.closeout_version === 2) return value.callback_promised_24_48_hours === true
    ? null : "Tell the client we will call back in 24–48 hours, then confirm it here.";
  if (value.disposition !== "appears_qualified") return null;
  if (!NETFLY_TRANSFER_OUTCOMES.includes(value.transfer_outcome)) return "Record what happened with the case-manager introduction.";
  if (["connected", "attempted_no_answer"].includes(value.transfer_outcome) && !value.transfer_destination.trim())
    return "Record the case-manager number or queue you actually called.";
  if (value.transfer_outcome === "not_attempted" && value.transfer_note.trim().length < 5)
    return "Explain why the transfer was not attempted.";
  if (value.transfer_outcome === "client_declined" && !value.client_notified_48_business_hours)
    return "Tell the client their case manager will call within 48 business hours, then confirm it here.";
  return null;
}

// The same parser is used for emailed and pasted source notes.
export { NETFLY_HANDOFF_LABELS, parseNetflyHandoff } from "./netfly-handoff";

export type NetflyField = {
  id: string;
  label: string;
  kind?: "text" | "date" | "tel" | "email" | "long" | "choice";
  choices?: string[];
  when?: { id: string; is: string };
  hint?: string;
};
export type NetflySection = { id: string; title: string; script?: string; fields: NetflyField[] };
const yesNo = ["Yes", "No", "Not sure"];
const yn = (id: string, label: string, extra: Partial<NetflyField> = {}): NetflyField => ({ id, label, kind: "choice", choices: yesNo, ...extra });
const txt = (id: string, label: string, extra: Partial<NetflyField> = {}): NetflyField => ({ id, label, kind: "text", ...extra });

export const NETFLY_SECTIONS: NetflySection[] = [
  { id: "care", title: "1. Welcome to the firm", script: "Hi, [first name], this is [your name] with Turnbull, Moak & Pendergrass. Great to meet you! I just wanted to jump on the phone to welcome you to the firm. I'm going to verify a few things, gather some brief additional details, and then we'll talk about next steps.", fields: [
    yn("seen_doctor", "Have you been able to get checked out yet?", { hint: "Include the ER, urgent care, or a doctor." }),
    txt("first_provider", "Where did you go?", { hint: "Facility or provider name and city.", when: { id: "seen_doctor", is: "Yes" } }),
    txt("first_provider_address", "First provider address", { when: { id: "seen_doctor", is: "Yes" } }),
    txt("first_provider_phone", "First provider phone", { kind: "tel", when: { id: "seen_doctor", is: "Yes" } }),
    txt("first_visit", "When was your first visit?", { kind: "date", when: { id: "seen_doctor", is: "Yes" } }),
    yn("ambulance", "Did an ambulance take you from the scene?"),
    txt("treated_injuries", "What injuries are they treating you for?", { kind: "long", when: { id: "seen_doctor", is: "Yes" } }),
    txt("other_pain", "Anywhere else you're still feeling it?", { kind: "long" }),
    yn("still_treating", "Are you still going to the doctor?", { when: { id: "seen_doctor", is: "Yes" } }),
    txt("current_provider", "Who are you seeing now?", { when: { id: "still_treating", is: "Yes" } }),
    txt("current_provider_address", "Current provider address", { when: { id: "still_treating", is: "Yes" } }),
    txt("current_provider_phone", "Current provider phone", { kind: "tel", when: { id: "still_treating", is: "Yes" } }),
    txt("last_appointment", "When was your last appointment?", { kind: "date", when: { id: "still_treating", is: "Yes" } }),
    txt("next_appointment", "When's your next appointment?", { kind: "date", when: { id: "still_treating", is: "Yes" } }),
  ] },
  { id: "contact", title: "2. Confirm their information", script: "Let me make sure we have everything right on our end. I'll read back your name and spell it. Is that right?", fields: [
    yn("name_confirmed", "Is the name on the signed retainer correct?"),
    txt("confirmed_name", "Client's correct full name", { when: { id: "name_confirmed", is: "No" } }),
    txt("dob", "Date of birth", { kind: "date" }), txt("mailing_address", "What's your mailing address?", { hint: "Street, city, state and ZIP." }),
    txt("confirmed_email", "What's the best email for you?", { kind: "email" }), txt("confirmed_phone", "What's the best number to reach you?", { kind: "tel" }),
  ] },
  { id: "accident", title: "3. The accident & passengers", script: "I have the city, state and approximate date on your file. Let me confirm the exact details with you.", fields: [
    txt("accident_city", "What city did this happen in?"), txt("accident_state", "What state?"),
    txt("accident_month_year", "Rough month and year from NETFLY"), txt("accident_date", "What day did the accident happen?", { kind: "date" }),
    txt("road", "What road or intersection was it on?"),
    { id: "position", label: "Were you the driver, passenger, or pedestrian?", kind: "choice", choices: ["Driver", "Passenger", "Pedestrian", "Other", "Not sure"] },
    txt("incident_story", "Tell me a little about what happened.", { kind: "long", hint: "Confirm the notes already on file. Let them fill in anything missing." }),
    yn("passengers", "Was anyone else in the vehicle with you?"),
    txt("passenger_details", "Would they like us to give them a call too?", { kind: "long", hint: "Optional: name, best number, any injuries, and whether they want a call. Details can wait.", when: { id: "passengers", is: "Yes" } }),
    yn("death", "Was there a death?"), txt("hospital_days", "Was anyone admitted to a hospital? How many days?"),
    yn("commercial_truck", "Was an 18-wheeler or commercial truck involved?"), yn("serious_injury", "Were there serious injuries?"),
  ] },
  { id: "police", title: "4. Police & the other driver", fields: [
    { id: "fault", label: "Who was at fault, as the client understands it?", kind: "choice", choices: ["Other driver", "Client", "Unclear", "Not sure"] },
    yn("police_came", "Did the police come out?"), txt("police_department", "Do you remember which police department came out?", { hint: "Reporting agency, if known." }), txt("police_report", "Do you have the report or case number handy?"),
    yn("ticket", "Did anyone get a ticket?"), txt("ticket_details", "Who got it, and what for?", { when: { id: "ticket", is: "Yes" } }),
    txt("other_driver", "Other driver's name"), txt("other_vehicle", "Their vehicle: year, make, model"),
    yn("company_vehicle", "Was it a work truck or company vehicle?"),
    yn("alcohol_drugs", "Did you see signs of drinking or drug use?"), yn("on_phone", "Did you see them on their phone?"),
    txt("other_insurer", "Other driver's insurer"), txt("other_policy", "Policy number"), txt("other_claim", "Other driver's claim number"),
  ] },
  { id: "vehicle", title: "5. Vehicle, pictures & witnesses", fields: [
    txt("own_vehicle", "Your vehicle: year, make, model"), txt("damage", "What would I have seen standing five feet from it?", { kind: "long" }),
    yn("drivable", "Was it drivable?"), yn("totaled", "Was it totaled?"), txt("estimate", "Repair estimate, if any"),
    yn("photos", "Do you have pictures or video?"), yn("witnesses", "Were there witnesses?"),
    txt("witness_details", "Witness names and numbers", { kind: "long", when: { id: "witnesses", is: "Yes" } }),
  ] },
  { id: "insurance", title: "6. Insurance", fields: [
    yn("auto_insured", "Do you have your own auto insurance?"), txt("auto_carrier", "Who's your auto insurance with?"), txt("auto_policy", "Auto policy number"),
    yn("um_uim", "Do you know if you have UM/UIM coverage?"), yn("health_insured", "Do you have health insurance?"),
    txt("health_carrier", "Who's your health insurance with?"), txt("health_group", "Health group number"),
    yn("insurer_contact", "Has any insurance company reached out?"), yn("recorded_statement", "Did you give a recorded statement?"),
    yn("money_offer", "Has anyone offered you money?"), yn("insurance_papers", "Has an insurer sent anything to sign?"),
    yn("insurance_signed", "Did you sign any insurance papers?"), txt("insurance_notes", "Which insurer contacted you, and what did they say?", { kind: "long", when: { id: "insurer_contact", is: "Yes" } }),
  ] },
  { id: "work", title: "7. Work & final details", fields: [
    yn("working", "Are you working right now?"), txt("employer", "Who for?", { when: { id: "working", is: "Yes" } }),
    txt("days_missed", "Days of work missed because of the accident"), txt("lost_pay", "Estimated pay lost"),
    txt("emergency_contact", "Emergency contact: name, number, relationship", { kind: "long" }),
    yn("other_lawyer_talk", "Have you talked to another attorney about this accident?"),
    yn("other_lawyer_signed", "Have you signed with another attorney?"),
    txt("other_lawyer_details", "Other attorney details", { kind: "long", when: { id: "other_lawyer_signed", is: "Yes" } }),
  ] },
  { id: "close", title: "8. Protect & close", script: "If the other driver's insurance company calls, give them the firm's number, (205) 831-5040, and let the firm handle it. Take care of yourself and make every appointment. What questions can I answer for you?", fields: [
    yn("refer_insurer", "Will the client refer the insurer to the firm?"), txt("client_questions", "Client questions and answers given", { kind: "long" }),
    yn("wants_cancel", "Does the client want to cancel with the firm?"), txt("final_notes", "Final notes and any requested follow-up", { kind: "long" }),
  ] },
];

// The welcome call is a short case-manager workup. Keep the original NETFLY
// questionnaire above as an archive of earlier answers, not the call script.
export const NETFLY_CASE_MANAGER_FIELDS: NetflyField[] = [
  { id: "contact_accuracy", label: "Let me read back your contact details. Does everything sound right?", hint: "Confirm name, phone, email and address; ask only for corrections or missing details.", kind: "choice", choices: ["Yes", "Needs correction"] },
  { id: "insurance_info_available", label: "Do you have your insurance details handy, or the other driver's?", kind: "choice", choices: ["Client's insurance", "Other driver's insurance", "Both", "No details available yet"] },
  { id: "care_today", label: "Would you be able to get checked out today?", kind: "choice", choices: ["Yes", "No", "Already in care", "Not sure"] },
  { id: "care_today_setting", label: "Where can you be seen today?", kind: "choice", choices: ["Emergency room", "Urgent care", "Other provider", "Not sure"] },
  { id: "care_today_plan", label: "What would work better for you?", hint: "Note when they can go and anything they need help with.", kind: "long" },
  { id: "treatment_location", label: "Would treatment near home or work be easier?", kind: "choice", choices: ["Near home", "Near work", "Either", "Needs help deciding"] },
  { id: "treatment_area", label: "What area would be convenient for you?", hint: "City, ZIP code, or neighborhood.", kind: "text" },
  { id: "treatment_time", label: "What time of day works best?", kind: "choice", choices: ["Morning", "Afternoon", "Either"] },
  { id: "treatment_days", label: "Which days work best?", kind: "choice", choices: ["Weekdays", "Weekends", "Either"] },
  { id: "treatment_availability", label: "Any specific days or times to avoid or request?", kind: "text" },
  { id: "treatment_barrier", label: "Is there anything making it hard to get to your appointments?", kind: "long" },
  { id: "insurance_claim_number", label: "Did they give you a claim number?", kind: "text" },
];
// An unavailable answer is recorded separately from the real value, so a
// date, phone or email never gets filled with dummy data.
export const NETFLY_UNAVAILABLE_IDS = new Set(["confirmed_phone", "confirmed_email", "mailing_address", "accident_date", "police_report", "police_department", "accident_city", "accident_state", "road", "first_visit", "first_provider", "auto_carrier", "other_insurer"]);
const coreFields = [...NETFLY_SECTIONS.flatMap((s) => s.fields), ...NETFLY_CASE_MANAGER_FIELDS];
export const NETFLY_FIELDS: NetflyField[] = [...coreFields, ...coreFields.filter((field) => NETFLY_UNAVAILABLE_IDS.has(field.id)).map((field): NetflyField => ({ id: `${field.id}_unavailable`, label: `${field.label} — availability`, kind: "choice", choices: ["Not available yet"] }))];
export const NETFLY_FIELD_IDS = new Set(NETFLY_FIELDS.map((f) => f.id));
export function netflyFlags(a: Record<string, string>): string[] {
  const out: string[] = [];
  if (a.death === "Yes" || Number.parseInt(a.hospital_days || "", 10) >= 3 || (a.commercial_truck === "Yes" && a.serious_injury === "Yes")) out.push("Get a supervisor on the call now");
  if (a.fault === "Client" || a.ticket === "Yes") out.push("Fault or ticket — supervisor review");
  if (a.other_lawyer_talk === "Yes" || a.other_lawyer_signed === "Yes") out.push("Other attorney — supervisor review");
  if (a.recorded_statement === "Yes" || a.insurance_signed === "Yes") out.push("Insurer statement or signed papers — supervisor review");
  if (a.wants_cancel === "Yes") out.push("Cancellation requested — bring in supervisor");
  return out;
}
