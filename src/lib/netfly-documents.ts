export const NETFLY_DOCUMENT_KINDS = [
  { key: "netfly_driver_license", label: "Driver's license" },
  { key: "netfly_health_insurance", label: "Health insurance card" },
  { key: "netfly_auto_insurance", label: "Auto insurance card" },
  { key: "netfly_police_report", label: "Police report" },
  { key: "netfly_car_damage", label: "Car damage photos" },
] as const;

export type NetflyDocumentKind = typeof NETFLY_DOCUMENT_KINDS[number]["key"];
export const NETFLY_DOCUMENT_KEYS = new Set<string>(NETFLY_DOCUMENT_KINDS.map((kind) => kind.key));
export const INBOUND_DOCUMENT_TYPES = new Set(["client_photo", "client_doc", "client_file"]);

export function netflyPhotoRequest(firstName: string): string {
  const name = firstName.trim().split(/\s+/)[0] || "there";
  return `Hi ${name}, this is the Turnbull, Moak & Pendergrass team. As we prepare your case, please reply with clear photos of your driver's license, health insurance card, auto insurance card, police report (if available), and vehicle damage. You can send them one at a time; tell us what each picture is. Please do not text your Social Security number. Reply STOP to opt out.`;
}

// Storage URLs are issued only for the authenticated NETFLY matter. Never sign
// a key that can normalize outside the firm's lead folder.
export function netflyDocumentKey(path: string | null, firmId: string, leadId: string): string | null {
  if (!path || path.length > 512 || path.includes("..") || path.includes("//") || path.includes("\\") || /%|[\u0000-\u001f]/.test(path)) return null;
  const prefix = `${firmId}/${leadId}/`;
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  if (!rest || rest.split("/").some((segment) => !segment || segment.startsWith("."))) return null;
  return path;
}
