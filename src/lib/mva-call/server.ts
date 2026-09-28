// ============================================================================
// Server helpers for the MVA call console. Every route in /api/calls uses these
// so the lead lookup, who-may-call rule and lead mirroring are defined once.
// ============================================================================
import { gateUser, type GatedUser } from "@/lib/gate";
import { isInternalRole } from "@/lib/permissions";
import { leadKeyOf } from "@/lib/lead-key";

/** Staff only. Firm logins never reach the call console. */
export async function requireStaff(sb: any): Promise<GatedUser | null> {
  const g = await gateUser(sb);
  if (!g || !isInternalRole(g.role)) return null;
  return g;
}

/** Owners, admins and managers hear recordings. Agents see the call, not the audio. */
export function canHearRecordings(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

export const LEAD_CALL_COLS =
  "id, firm_id, lead_no, campaign_id, campaign, case_type, claimant_name, first_name, last_name, phone, phone_norm, email, dob, ssn_last4, mail_addr1, mail_city, mail_state, mail_zip, perm_call, perm_text, perm_email, comms_monitored, comms_safe_channels, archived_at, created_at, external_id";

/** "Turnbull Moak & Pendergrass" -> "Turnbull Moak and Pendergrass", said the way an agent says it. */
export function firmSpoken(name: string | null | undefined): string {
  return String(name || "the firm").replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ").trim();
}

export function fmtPhone(raw: string | null | undefined): string {
  const d = String(raw || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(raw || "");
}

/** "04/12/1991", "4/12/91" or "1991-04-12" -> "1991-04-12". Anything else -> null. */
export function parseDob(raw: string | null | undefined): string | null {
  const t = String(raw || "").trim();
  let y: number, m: number, d: number;
  let mm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (mm) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
  else {
    mm = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/.exec(t);
    if (!mm) {
      const digits = t.replace(/\D/g, "");
      if (digits.length !== 8) return null;
      mm = ["", digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)] as any;
    }
    m = +mm![1]; d = +mm![2]; y = +mm![3];
    if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt > new Date()) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** MM/DD/YYYY for the retainer. */
export function dobForForm(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

export function splitName(full: string): { first: string; last: string } {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}

/** Crash date from the Story step, as YYYY-MM-DD. */
export function crashDateOf(story: any, now: Date = new Date()): string | null {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (story?.when === "Today") return iso(now);
  if (story?.when === "Yesterday") return iso(new Date(now.getTime() - 86400000));
  if (story?.when === "Pick a date" && /^\d{4}-\d{2}-\d{2}$/.test(String(story?.date || ""))) return String(story.date);
  return null;
}

/**
 * What the call answers put on the lead record. Only fields the agent actually
 * filled go in, so a blank never wipes something the file already had. Every
 * key here is a real leads column (a phantom column rejects the whole update).
 */
export function leadPatchFromAnswers(a: any): Record<string, any> {
  const out: Record<string, any> = {};
  const client = String(a?.send?.client || "").trim();
  if (client) {
    const { first, last } = splitName(client);
    out.claimant_name = client;
    if (first) out.first_name = first;
    if (last) out.last_name = last;
  }
  const email = String(a?.send?.email || "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.email = email;
  const dob = parseDob(a?.file?.dob);
  if (dob) out.dob = dob;
  const addr = String(a?.file?.addr || "").trim();
  if (addr) out.mail_addr1 = addr;
  const ecName = String(a?.file?.ecName || "").trim();
  if (ecName) out.ec_name = ecName;
  const ecPhone = String(a?.file?.ecPhone || "").trim();
  if (ecPhone) out.ec_phone = ecPhone;
  if (a?.file?.ecRel) out.ec_relationship = String(a.file.ecRel);
  const crash = crashDateOf(a?.story);
  if (crash) out.incident_start = crash;
  return out;
}

// A visit date from the 30-day check, as the summary prints it.
function visitText(v: any, story: any): string {
  const mdy = (x: any) => { const m = String(x || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[2]}/${m[3]}/${m[1]}` : ""; };
  if (v === "same") { const c = mdy(crashDateOf(story)); return c ? `Same day as the wreck (${c})` : "Same day as the wreck"; }
  if (v === "unsure") return "Not sure";
  return mdy(v);
}

/** A short case summary for print and email. Never includes the SSN. */
export function caseSummaryRows(lead: any, a: any): { k: string; v: string }[] {
  const st = a?.story || {}, b = a?.body || {}, f = a?.file || {};
  const rows: [string, any][] = [
    ["Name", lead?.claimant_name],
    ["Lead", lead?.lead_no],
    ["Phone", fmtPhone(lead?.phone)],
    ["Email", lead?.email],
    ["Date of birth", lead?.dob],
    ["Crash", [crashDateOf(st), String(st.city || "").trim().replace(/,\s*$/, "")].filter(Boolean).join(", ")],
    ["Fault", st.fault],
    ["The PNC was", st.seat === "Other" ? `Other: ${st.seatOther || ""}` : st.seat],
    ["Police", st.police],
    ["What happened", st.text],
    ["Pain", (b.pain || []).join(", ")],
    ["Pain notes", String(b.painNote || "").trim()],
    ["Seen by", (b.seen || []).join(", ")],
    ["First seen", visitText(b.firstAt, st)],
    ["Last seen", visitText(b.lastAt, st) || b.last],
    ["Month with no visit", b.stretch],
    ["Will treat", b.willing],
    ["Missed work", b.work],
    ["Exchanged info", b.exchanged],
    ["Their coverage", b.coverage],
    ["UM/UIM", b.uim],
    ["Injury payment", b.check],
    ["Signed elsewhere", b.rep],
    ["Passengers", a?.car?.justMe ? "Just them" : (a?.car?.people || []).map((p: any) => [p.name, p.age, p.hurt === "Yes" ? "hurt" : p.hurt === "No" ? "not hurt" : ""].filter(Boolean).join(" ")).join("; ")],
    ["Home address", f.addr],
    ["Driver's license", f.dl],
    ["Emergency contact", [f.ecName, f.ecPhone, f.ecRel].filter(Boolean).join(", ")],
    ["Other driver's insurance", f.carrier && f.carrier !== "Pick one" ? f.carrier : ""],
    ["Police report", f.report],
    ["Vehicle", [f.vYear !== "Year" ? f.vYear : "", f.vMake, f.vModel].filter(Boolean).join(" ")],
  ];
  return rows.filter(([, v]) => v != null && String(v).trim() !== "").map(([k, v]) => ({ k, v: String(v) }));
}

export function esc(s: string): string {
  return String(s || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
}

export function caseEmailHtml(opts: { title: string; rows: { k: string; v: string }[]; link: string; note?: string }): string {
  const trs = opts.rows.map((r) => `<tr><td style="padding:6px 12px 6px 0;color:#6D6D72;vertical-align:top;white-space:nowrap">${esc(r.k)}</td><td style="padding:6px 0;color:#0D1420">${esc(r.v)}</td></tr>`).join("");
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px">
<h2 style="color:#16324F;margin:0 0 6px;font-size:20px">${esc(opts.title)}</h2>
${opts.note ? `<p style="margin:0 0 12px;color:#334155">${esc(opts.note)}</p>` : ""}
<table style="border-collapse:collapse;font-size:14px;width:100%">${trs}</table>
<p style="margin:18px 0 0"><a href="${esc(opts.link)}" style="display:inline-block;background:#22C55E;color:#06290F;font-weight:700;text-decoration:none;padding:11px 18px;border-radius:10px">Open the file in ClaimReach</a></p>
<p style="margin:14px 0 0;color:#94a3b8;font-size:12px">The SSN and the signed agreement stay in ClaimReach. Log in to see them.</p>
</div>`;
}

/**
 * The file behind a LawRuler lead ID (the link in LawRuler's new-lead text).
 * App (MVA) files first, newest first. Runs as the signed-in user, so RLS
 * decides what they can open.
 */
export async function findByLawRulerId(sb: any, raw: string): Promise<{ id: string; key: string } | null> {
  const id = String(raw || "").trim();
  if (!/^[\w.-]{1,64}$/.test(id)) return null;
  const { data } = await sb.from("leads").select("id, lead_no, case_type, created_at, archived_at")
    .or(`lawruler_ref_no.eq.${id},external_id.eq.${id}`).order("created_at", { ascending: false }).limit(10);
  const rows = (data ?? []).filter((r: any) => !r.archived_at);
  const best = rows.find((r: any) => r.case_type === "mva") || rows[0];
  return best ? { id: best.id, key: leadKeyOf(best) } : null;
}
