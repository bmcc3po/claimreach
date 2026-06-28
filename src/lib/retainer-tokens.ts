// Build the token map for retainer autofill from a lead row (+ intake answers).
// Stable namespaces so templates can use {{contact.first_name}}, {{case.summary}}, etc.
export function retainerTokens(lead: any, answers: Record<string, any> = {}): Record<string, string> {
  const t: Record<string, string> = {
    "contact.first_name": lead.first_name ?? "",
    "contact.last_name": lead.last_name ?? "",
    "contact.full_name": lead.full_name ?? lead.claimant_name ?? "",
    "contact.phone": lead.phone ?? "",
    "contact.email": lead.email ?? "",
    "contact.dob": lead.dob ?? "",
    "contact.address": [lead.mail_addr1, lead.mail_addr2, lead.mail_city, lead.mail_state, lead.mail_zip].filter(Boolean).join(", "),
    "case.lead_no": lead.lead_no ?? "",
    "case.summary": lead.case_summary ?? "",
    "case.description": lead.case_description ?? "",
    "case.handling_attorney": lead.handling_attorney ?? "",
    "case.referring_attorney": lead.referring_attorney ?? "",
    "case.type": lead.case_type ?? "",
    "today": new Date().toLocaleDateString(),
  };
  for (const [k, v] of Object.entries(answers)) t[`intake.${k}`] = Array.isArray(v) ? v.join(", ") : String(v ?? "");
  return t;
}
export function fillTemplate(body: string, tokens: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => tokens[key] ?? `[${key}]`);
}

// Catalog of available tokens, grouped, for the template-editor picker.
export const TOKEN_CATALOG: { group: string; tokens: { key: string; label: string }[] }[] = [
  { group: "Client", tokens: [
    { key: "contact.full_name", label: "Full name" },
    { key: "contact.first_name", label: "First name" },
    { key: "contact.last_name", label: "Last name" },
    { key: "contact.phone", label: "Phone" },
    { key: "contact.email", label: "Email" },
    { key: "contact.dob", label: "Date of birth" },
    { key: "contact.address", label: "Mailing address" },
  ]},
  { group: "Case", tokens: [
    { key: "case.lead_no", label: "File / lead number" },
    { key: "case.type", label: "Case type" },
    { key: "case.handling_attorney", label: "Handling attorney" },
    { key: "case.referring_attorney", label: "Referring attorney" },
    { key: "case.summary", label: "Case summary" },
    { key: "case.description", label: "Case description" },
  ]},
  { group: "Other", tokens: [
    { key: "today", label: "Today's date" },
    { key: "intake.FIELD_ID", label: "Any intake field (replace FIELD_ID)" },
  ]},
];
