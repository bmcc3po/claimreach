// One conversational welcome-call order, using the saved question registry.
export const NETFLY_WELCOME_STEPS = [
  { shortTitle: "Welcome", title: "1. Welcome & feeling better", script: "Hi, [first name], this is [your name] with Turnbull, Moak & Pendergrass. I'm so sorry to hear about the accident. We're here to help you through this. I'd like to gather a few brief details so we can help get your treatment moving and get you on the road to recovery.", fields: ["seen_doctor", "first_provider", "first_visit", "care_today", "care_today_setting", "care_today_plan", "health_insured", "health_carrier", "ambulance", "contact_accuracy", "confirmed_name", "confirmed_phone", "confirmed_email", "mailing_address"] },
  { shortTitle: "Accident", title: "2. A little about the accident", script: "I have the information you already shared. Let me check a couple of things while we get your care lined up.", fields: ["accident_date", "accident_city", "accident_state", "road", "police_came", "police_report", "police_department", "treatment_location", "treatment_area", "photo_request_permission", "incident_story"] },
  { shortTitle: "Care", title: "3. What works for you", script: "Thank you—that helps. Just a few last things so the team can make this easier for you.", fields: ["insurance_info_available", "auto_carrier", "other_insurer", "insurer_contact", "insurance_claim_number", "treatment_time", "treatment_days", "treatment_availability", "passengers", "passenger_details", "totaled", "drivable", "towed"] },
  { shortTitle: "Wrap up", title: "4. You're in good hands", script: "Perfect, [first name]. Thank you for your patience. A couple of things and I'll let you go. You're going to hear these reminders again because they're important.", fields: ["client_questions"] },
  { shortTitle: "Review", title: "After call: review & documents", script: "", fields: [] },
] as const;

// Additional detail is available if the client brings it up. Care preferences,
// insurance contact, photos and the welcoming guidance stay in the main call.
export const NETFLY_FOLLOWUP_FIELDS: Record<number, readonly string[]> = {
  0: ["treated_injuries", "treatment_barrier"],
  2: ["auto_policy", "other_policy", "other_claim", "insurance_notes", "photos"],
};
export const NETFLY_CLOSING_REMINDERS = [
  "If the other driver's insurance company calls you, you don't have to talk to them. Give them our number and we'll take it from there.",
  "Stay off social media about the accident—no posts, pictures, or updates about how you're feeling.",
  "The most important thing is getting yourself healthy. You focus on your treatment; the firm will focus on everything else.",
  "We'll get your case entered and call you back within 24–48 hours. If you need anything in the meantime, please don't hesitate to call our office at (205) 831-5040.",
] as const;
export const netflyWelcomeStepFor = (id: string) => Math.max(0, NETFLY_WELCOME_STEPS.findIndex(step => (step.fields as readonly string[]).includes(id)));

export function netflyCareGuidance(values: Record<string, string>): string {
  if (values.care_today === "No" || values.care_today === "Not sure")
    return "No worries. I'll see whether we can arrange a virtual visit as a starting point. Let me note what would work for you.";
  if (values.seen_doctor === "No")
    return "No problem. We only get one body, so let's help you get checked as soon as possible. Would you be able to go to the ER today, or urgent care if that's easier?";
  return values.seen_doctor === "Yes" ? "I'm glad you were able to get checked. Let's make sure the team knows what care you still need." : "Let's help you get the care you need.";
}

export const NETFLY_FIRST_CALL_SOURCE_LABELS: Record<string, string> = {
  accident_date: "Accident Date", incident_story: "Accident Summary", police_report: "Case #",
  accident_city: "Location", accident_state: "Location", road: "Location", passengers: "Passengers",
};

export function netflyFirstCallSources(noteRows: { label: string; value: string }[], fields: Record<string, string>) {
  const rows = new Map(noteRows.filter((row) => row.value.trim()).map((row) => [row.label, row.value]));
  const add = (label: string, value: string | undefined) => { if (!rows.has(label) && value?.trim()) rows.set(label, value); };
  add("Accident Date", fields["Accident date"]);
  add("Location", [fields["Accident location"], fields["Accident city"], fields["Accident state"]].filter(Boolean).join(", "));
  add("Case #", fields["Case number"]);
  add("Passengers", fields.Passengers);
  add("Accident Summary", fields["Accident narrative"]);
  return [...rows].map(([label, value]) => ({ label, value }));
}

export type FirstConversationItem = { id: string; label: string; step: number; status: "captured" | "missing" | "follow_up"; detail: string };
const pending = /^(?:not (?:sure|known|available)(?: yet)?|unknown|none available|pending)$/i;
const present = (value: unknown) => typeof value === "string" && !!value.trim();

/** Coverage only: missing information stays actionable without blocking call exit. */
export function netflyFirstConversationReview(
  values: Record<string, string>,
  contact: { phone?: string | null; email?: string | null; address?: string | null },
  verifiedSource: { label: string; value: string }[] = [],
): FirstConversationItem[] {
  const source = new Map(verifiedSource.map((row) => [row.label, row.value]));
  const item = (id: string, label: string, step: number, fallback = ""): FirstConversationItem => {
    if (!present(values[id]) && values[`${id}_unavailable`]) return { id, label, step, status: "follow_up", detail: "Not available yet" };
    const value = values[id] || fallback;
    if (present(value) && !pending.test(value.trim())) return { id, label, step, status: "captured", detail: value };
    if (values[`${id}_unavailable`] || present(value)) return { id, label, step, status: "follow_up", detail: "Not available yet" };
    return { id, label, step, status: "missing", detail: "Still to ask" };
  };
  const rows = [
    item("confirmed_phone", "Client phone", 0, contact.phone || ""),
    item("confirmed_email", "Client email", 0, contact.email || ""),
    item("mailing_address", "Client address", 0, contact.address || ""),
    item("accident_date", "Date of accident", 2, source.get("Accident Date") || ""),
    item("road", "Wreck location", 2, source.get("Location") || ""),
    item("police_report", "Wreck report / case number", 2, source.get("Case #") || ""),
    item("police_department", "Reporting agency", 2),
    item("passengers", "Anyone else in the vehicle", 2, source.get("Passengers") || ""),
    item("seen_doctor", "Treatment received", 1),
  ];
  const location = rows.find((row) => row.id === "road")!;
  if (!source.get("Location")) {
    const ids = ["road", "accident_city", "accident_state"];
    const missing = ids.find((id) => !present(values[id]) || pending.test(values[id].trim()));
    location.id = missing || "road";
    location.status = missing ? (ids.some((id) => values[`${id}_unavailable`] || pending.test(values[id] || "")) ? "follow_up" : "missing") : "captured";
    location.detail = missing ? "City, state and road / intersection" : ids.map((id) => values[id]).join(", ");
  }
  if (values.police_came === "No") {
    for (const row of rows.filter((row) => ["police_report", "police_department"].includes(row.id))) {
      if (row.status !== "captured") { row.status = "captured"; row.detail = "No police response reported"; }
    }
  }
  // Asking whether there were passengers is the minimum; details are optional.
  if (values.seen_doctor === "Yes") rows.push(item("first_provider", "Where treated", 1), item("first_visit", "When treated", 1));
  const insurance = item("insurance_info_available", "Client or other driver's insurance", 2);
  if ([values.auto_carrier, values.other_insurer].some((value) => present(value) && !pending.test(value.trim()))) {
    insurance.status = "captured";
    insurance.detail = [values.auto_carrier, values.other_insurer].filter(Boolean).join(" · ");
  } else if (values.insurance_info_available === "No details available yet" ||
    values.auto_carrier_unavailable || values.other_insurer_unavailable) {
    insurance.status = "follow_up"; insurance.detail = "Insurance details to collect";
  } else {
    insurance.status = "missing"; insurance.detail = "Get an insurer name from either side";
  }
  rows.push(insurance);
  return rows.map(row => ({ ...row, step: netflyWelcomeStepFor(row.id) }));
}

