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
