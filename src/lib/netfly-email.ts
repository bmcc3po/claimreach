import { parseNetflyHandoff } from "./netfly-ontake";

export const NETFLY_EMAIL_TO = "netfly@inbound.claimreach.com";
export const NETFLY_EMAIL_SENDERS = ["haleema@netflydigital.com", "sean@netflydigital.com"];

export function validateNetflyEmailEnvelope(input: { from: string; headerFrom: string; to: string; subject: string }, recipient = NETFLY_EMAIL_TO): string | null {
  const envelopeFrom = input.from.trim().toLowerCase();
  const headerFrom = input.headerFrom.trim().toLowerCase();
  const headerMailbox = /<([^<>]+)>/.exec(headerFrom)?.[1]?.trim() || headerFrom;
  if (input.to.trim().toLowerCase() !== recipient.toLowerCase()) return "NETFLY recipient mismatch";
  if (!NETFLY_EMAIL_SENDERS.includes(envelopeFrom) || headerMailbox !== envelopeFrom)
    return "NETFLY sender mismatch";
  if (!/^(re:\s*)?new signing!\s+\S/i.test(input.subject.trim())) return "NETFLY signing subject missing";
  return null;
}

export function parseNetflySigningEmail(text: string): { name: string; note: string; phone: string; email: string } | null {
  const normalized = text.replace(/\r\n?/g, "\n");
  const start = normalized.search(/Accident Intake Note\s*[-\u2013\u2014]\s*Turnbull Law/i);
  if (start < 0) return null;
  const note = normalized.slice(start).split(/\n(?:On .{8,}wrote:|From:|Sent:|To:|Cc:|Subject:)\s*/i)[0].trim();
  if (note.length < 40 || note.length > 20_000) return null;
  const rows = parseNetflyHandoff(note);
  const read = (label: string) => rows.find((row) => row.label === label)?.value.trim() || "";
  const name = read("Client/Driver").replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 160 || !read("Accident Date") || !read("Accident Summary")) return null;
  const phone = /^\+?[\d\s().-]{10,25}$/.test(read("Client Phone")) ? read("Client Phone") : "";
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(read("Client Email")) ? read("Client Email") : "";
  return { name, note, phone, email };
}

export function netflyHtmlToText(html: string): string {
  return html.replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

export function validNetflyRetainerPdf(filename: string, bytes: Uint8Array): boolean {
  if (!/^[^/\\]{1,240}\.pdf$/i.test(filename) || bytes.byteLength < 100 || bytes.byteLength > 8 * 1024 * 1024) return false;
  const decoder = new TextDecoder();
  return decoder.decode(bytes.slice(0, 8)).startsWith("%PDF-") && decoder.decode(bytes.slice(-2048)).includes("%%EOF");
}

// A forwarded copy has different mail headers; identify the handoff by its
// content and signed original so it cannot silently create a second file.
export async function netflyEmailFingerprint(note: string, pdf: Uint8Array): Promise<string> {
  const pdfHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(pdf).buffer))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const content = new TextEncoder().encode(`${note.replace(/\s+/g, " ").trim()}\n${pdfHash}`);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", content))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
