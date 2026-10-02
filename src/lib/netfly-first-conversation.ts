// One active welcome-call order, using the existing saved question IDs.
export const NETFLY_WELCOME_STEPS = [
  { title: "1. Welcome & contact", script: "Hi, [first name], this is [your name] with Turnbull, Moak & Pendergrass. Great to meet you! I just wanted to welcome you to the firm, check a few details, and talk about how we can help with next steps.", fields: ["contact_accuracy", "confirmed_name", "confirmed_phone", "confirmed_email", "mailing_address"] },
  { title: "2. Accident, police & passengers", script: "I have some notes from your first conversation. Let's make sure we've got the details right.", fields: ["accident_date", "accident_city", "accident_state", "road", "incident_story", "police_came", "police_report", "police_department", "passengers", "passenger_details"] },
  { title: "3. Vehicle & medical care", script: "Let's talk about how you're doing and any care you've had so far.", fields: ["totaled", "drivable", "seen_doctor", "ambulance", "first_provider", "first_visit", "treated_injuries", "care_today", "care_today_setting", "care_today_plan"] },
  { title: "4. Treatment plan", script: "Let's find out what would make getting care easier for you.", fields: ["treatment_location", "treatment_area", "treatment_time", "treatment_days", "treatment_availability", "health_insured", "health_carrier", "treatment_barrier"] },
  { title: "5. Insurance & pictures", script: "We'll work with whatever insurance details and pictures you have handy.", fields: ["insurance_info_available", "auto_carrier", "auto_policy", "other_insurer", "other_policy", "other_claim", "insurer_contact", "insurance_notes", "insurance_claim_number", "photos"] },
  { title: "6. Outcome & next steps", script: "Thanks so much for your patience. We'll get your case entered into the system and call you back within 24 to 48 hours.", fields: ["final_notes"] },
  { title: "7. After call: review file", script: "", fields: [] },
] as const;

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
    item("accident_date", "Date of accident", 1, source.get("Accident Date") || ""),
    item("road", "Wreck location", 1, source.get("Location") || ""),
    item("police_report", "Wreck report / case number", 1, source.get("Case #") || ""),
    item("police_department", "Reporting agency", 1),
    item("passengers", "Anyone else in the vehicle", 1, source.get("Passengers") || ""),
    item("seen_doctor", "Treatment received", 2),
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
  if (values.seen_doctor === "Yes") rows.push(item("first_provider", "Where treated", 2), item("first_visit", "When treated", 2));
  const insurance = item("insurance_info_available", "Client or other driver's insurance", 4);
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
  return rows;
}
