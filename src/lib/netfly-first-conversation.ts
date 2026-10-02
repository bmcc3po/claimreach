// One active welcome-call order, using the existing saved question IDs.
export const NETFLY_WELCOME_STEPS = [
  { title: "1. Welcome & contact", script: "Hi, [first name], this is [your name] with Turnbull, Moak & Pendergrass. Welcome to the firm! Let me confirm how to reach you and see how we can help.", fields: ["contact_accuracy", "confirmed_name", "confirmed_phone", "confirmed_email", "mailing_address"] },
  { title: "2. Care & treatment", script: "How are you doing? Have you been able to get checked out?", fields: ["seen_doctor", "first_provider", "first_visit", "care_today", "care_today_setting", "care_today_plan", "health_insured", "health_carrier"] },
  { title: "3. Fill in the gaps", script: "I have your first intake here. Let's fill in anything we're missing.", fields: ["accident_date", "accident_city", "accident_state", "road", "incident_story", "police_came", "police_report", "police_department", "passengers", "passenger_details", "totaled", "drivable", "insurance_info_available", "auto_carrier", "other_insurer", "insurance_claim_number"] },
  { title: "4. Wrap up", script: "Thanks so much for your patience. We'll get your case entered into the system and call you back within 24 to 48 hours. If you need us, call (205) 831-5040.", fields: ["final_notes"] },
  { title: "After call: review & documents", script: "", fields: [] },
] as const;

// Keep useful detail available without making the first call a second intake.
export const NETFLY_FOLLOWUP_FIELDS: Record<number, readonly string[]> = {
  1: ["ambulance", "treated_injuries", "treatment_location", "treatment_area", "treatment_time", "treatment_days", "treatment_availability", "treatment_barrier"],
  2: ["auto_policy", "other_policy", "other_claim", "insurer_contact", "insurance_notes", "photos"],
};

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
  return rows;
}
