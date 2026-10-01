import { parseNetflyHandoff } from "./netfly-ontake";

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
