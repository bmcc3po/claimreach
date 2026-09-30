// ============================================================================
// Shared intake renderers. Build a single claimant's intake as PDF bytes or as
// a one-row CSV, from the resolved questionnaire. Used by the export routes and
// by firm delivery so there is one source of truth for the artifact shape.
// ============================================================================
import { caseReport, type ReportSection } from "@/lib/mva-call/report";

const SKIP_KINDS = ["section", "script", "gate"];

// Intake answers live in the claim's `answers` jsonb — the "Take a call" console
// AND the questionnaire both write there, keyed by field id, regardless of a
// field's declared `scope`. Read there FIRST; fall back to a real lead-table
// column only when the jsonb has nothing (covers the few fields that are backed
// by an actual leads column, e.g. claimant_name/phone). The old code keyed
// lead-scope fields off the leads table only, so every console-captured answer
// exported as "—".
function resolveRaw(field: any, leadRow: any, answers: Record<string, any>): any {
  let raw = answers?.[field.id];
  if (raw === undefined || raw === null || raw === "") {
    const col = leadRow?.[field.id];
    if (col !== undefined && col !== null && col !== "") raw = col;
  }
  return raw;
}

// A stored choice VALUE prints as the spoken label the caller heard (the
// questionnaire's `choices` value->label map), so exports read in plain English.
function labelFor(field: any, v: any): string | null {
  const ch = field?.choices;
  if (Array.isArray(ch)) {
    const hit = ch.find((o: any) => o && o.value === v);
    if (hit) return hit.label ?? String(v);
  }
  return null;
}

function displayValue(field: any, raw: any, empty = "—"): string {
  if (raw === undefined || raw === null || raw === "") return empty;
  if (Array.isArray(raw)) return raw.map((v) => labelFor(field, v) ?? String(v)).join(", ");
  const mapped = labelFor(field, raw);
  if (mapped) return mapped;
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  const low = String(raw).toLowerCase();
  if (low === "yes" || low === "true") return "Yes";
  if (low === "no" || low === "false") return "No";
  return String(raw);
}

function answerText(field: any, leadRow: any, answers: Record<string, any>): string {
  return displayValue(field, resolveRaw(field, leadRow, answers), "—");
}

// Resolve the questionnaire for a case type (published custom form first, else preset).
async function resolveFields(sb: any, caseType: string, campaignId?: string | null): Promise<any[]> {
  let fields: any[] = [];
  try { const { resolveIntakeFields } = await import("@/lib/forms"); fields = await resolveIntakeFields(sb, caseType, campaignId ?? null); } catch {}
  if (!fields || fields.length === 0) { try { const { intakeForType } = await import("@/lib/questionnaire"); fields = intakeForType(caseType) as any[]; } catch {} }
  return fields || [];
}

export interface IntakeBundle {
  lead: any;
  claim: any;
  answers: Record<string, any>;
  caseType: string;
  fields: any[];
}

// Compiled MVA calls are stored under answers.mva_call, not the form builder's
// flat field IDs. The existing call report runs those answers through the same
// engine as the agent screen. Keep that question/branch definition shared and
// never dump the raw object (which may contain sensitive transient fields).
export function intakeSections(b: IntakeBundle): ReportSection[] {
  const call = b.answers?.mva_call;
  if (b.caseType === "mva" && call && typeof call === "object" && !Array.isArray(call)) {
    return caseReport({ ...b.lead, campaign: b.claim?.campaign ?? b.lead.campaign }, call).sections;
  }
  const sections: ReportSection[] = [];
  let section: ReportSection = { id: "intake", title: "Intake", rows: [] };
  sections.push(section);
  for (const f of b.fields ?? []) {
    if (f.kind === "section") {
      section = { id: f.id, title: String(f.label || "Intake"), rows: [] };
      sections.push(section);
    } else if (!SKIP_KINDS.includes(f.kind)) {
      section.rows.push({ q: f.label || f.id, a: answerText(f, b.lead, b.answers) });
    }
  }
  return sections.filter((s) => s.rows.length > 0);
}

export function hasIntakeQuestions(b: IntakeBundle): boolean {
  return intakeSections(b).some((s) => s.rows.length > 0);
}

/** The same resolved question/answer rows used by the PDF and CSV, escaped for email. */
export function buildIntakeEmailHtml(b: IntakeBundle): string {
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]!));
  const sections = intakeSections(b).map((section) => {
    const rows = section.rows.map((row) =>
      `<tr><th scope="row" style="text-align:left;vertical-align:top;padding:7px 12px 7px 0;width:42%;font-weight:600">${escape(row.q)}</th>` +
      `<td style="vertical-align:top;padding:7px 0;white-space:pre-wrap">${escape(row.a)}</td></tr>`
    ).join("");
    return `<h3 style="font-size:15px;margin:20px 0 6px">${escape(section.title)}</h3>` +
      `<table style="border-collapse:collapse;width:100%;font-size:13px">${rows}</table>`;
  }).join("");
  return `<section aria-label="Intake questions and answers"><h2 style="font-size:18px;margin:24px 0 8px">Intake questions and answers</h2>${sections}</section>`;
}

// Load everything needed to render ONE matter's intake: the named claim's
// answers, case type and campaign form, never whichever claim the database
// returned first (Astra round 7b #57: a file with two matters rendered the
// first one's answers into the second one's delivery).
//   null   = the file, or that claim on that file, does not exist
//   throws = a read failed (the caller must not treat it as "nothing to send")
// `sb` does every read; firm delivery passes its service client.
export async function loadIntakeBundle(sb: any, leadId: string, claimId: string): Promise<IntakeBundle | null> {
  if (!leadId || !claimId) return null;
  const { data: lead, error: leadErr } = await sb.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (leadErr) throw new Error(`Could not read the file: ${leadErr.message}`);
  if (!lead) return null;
  const { data: claim, error: claimErr } = await sb.from("claims")
    .select("id, lead_id, firm_id, answers, claim_type, campaign, campaign_id")
    .eq("id", claimId).eq("lead_id", leadId).maybeSingle();
  if (claimErr) throw new Error(`Could not read the matter: ${claimErr.message}`);
  if (!claim) return null;
  if (claim.firm_id && claim.firm_id !== lead.firm_id) throw new Error("This matter and file belong to different firms.");
  const answers = claim.answers ?? {};
  const caseType = (claim.claim_type || lead.case_type || "").toLowerCase();
  // The claim's own campaign decides its form; a legacy claim with no
  // campaign recorded falls back to the file's, the same order
  // resolveFormKey uses.
  const fields = caseType === "mva" && answers.mva_call && typeof answers.mva_call === "object"
    ? [] : await resolveFields(sb, caseType, claim.campaign_id || lead.campaign_id || null);
  return { lead, claim, answers, caseType, fields };
}

// Build a clean intake PDF (every question + answer) for one claimant.
export async function buildIntakePdf(b: IntakeBundle): Promise<Uint8Array> {
  const { lead, claim, answers, caseType, fields } = b;
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 612; const H = 792;
  const sections = intakeSections(b);
  // Keep a complete intake readable. If every question and answer can fit on
  // one letter page with the compact layout, use it; otherwise paginate with
  // the regular type size instead of clipping or omitting answers.
  function lineCount(text: string, f: any, size: number, width: number): number {
    const words = String(text).split(/\s+/); let lines = 1; let cur = "";
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && f.widthOfTextAtSize(next, size) > width) { lines++; cur = word; }
      else cur = next;
    }
    return lines;
  }
  const compactHeight = (() => {
    const width = W - 64;
    let height = 19 + lineCount(lead.claimant_name || "Unnamed claimant", bold, 11, width) * 13
      + lineCount(`${lead.lead_no || ""}   ·   ${claim?.campaign || lead.campaign || ""}   ·   ${caseType}`, font, 8, width) * 10
      + 10 + 3 + 10;
    for (const section of sections) {
      height += 3 + lineCount(section.title.toUpperCase(), bold, 9, width) * 11 + 1;
      for (const row of section.rows) height += lineCount(row.q, bold, 8.5, width) * 10.5
        + lineCount(row.a, font, 8.5, width - 8) * 10.5 + 2;
    }
    return height;
  })();
  const compact = compactHeight <= H - 64 - 20;
  const M = compact ? 32 : 54; const wrapW = W - M * 2;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ink = rgb(0.07, 0.1, 0.16); const soft = rgb(0.4, 0.45, 0.53); const accent = rgb(0.85, 0.6, 0.16);

  function wrap(text: string, f: any, size: number, maxW: number): string[] {
    const words = String(text).split(/\s+/); const lines: string[] = []; let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(test, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }
  function draw(text: string, f: any, size: number, color: any, indent = 0) {
    for (const ln of wrap(text, f, size, wrapW - indent)) {
      if (y < M + 20) { page = pdf.addPage([W, H]); y = H - M; }
      page.drawText(ln, { x: M + indent, y, size, font: f, color });
      y -= size + (compact ? 2 : 4);
    }
  }

  page.drawText("CLAIM INTAKE", { x: M, y, size: compact ? 16 : 20, font: bold, color: ink }); y -= compact ? 19 : 26;
  draw(lead.claimant_name || "Unnamed claimant", bold, compact ? 11 : 14, ink);
  draw(`${lead.lead_no || ""}   ·   ${claim?.campaign || lead.campaign || ""}   ·   ${caseType}`, font, compact ? 8 : 10, soft);
  draw(`Exported ${new Date().toLocaleString()}`, font, compact ? 8 : 9, soft);
  y -= compact ? 3 : 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: rgb(0.9, 0.92, 0.95) }); y -= compact ? 10 : 18;

  for (const section of sections) {
    y -= compact ? 3 : 6; draw(section.title.toUpperCase(), bold, compact ? 9 : 11, accent); y -= compact ? 1 : 2;
    for (const row of section.rows) {
      draw(row.q, bold, compact ? 8.5 : 10.5, ink);
      draw(row.a, font, compact ? 8.5 : 10.5, rgb(0.15, 0.18, 0.24), compact ? 8 : 10);
      y -= compact ? 2 : 6;
    }
  }
  return await pdf.save();
}

/** The same PDF attachment shape for signed notices, case email and firm delivery. */
export async function buildIntakePdfAttachment(b: IntakeBundle): Promise<{ filename: string; content: string }> {
  const bytes = await buildIntakePdf(b);
  const name = String(b.lead.claimant_name || b.lead.lead_no || "claimant")
    .replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "claimant";
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { filename: `${name}_intake.pdf`, content: btoa(binary) };
}

// Build a one-row CSV (header + this claimant's answers) for one claimant.
export function buildIntakeCsvSingle(b: IntakeBundle): string {
  const esc = (v: any): string => {
    const s = v === undefined || v === null ? "" : Array.isArray(v) ? v.join("; ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = intakeSections(b).flatMap((s) => s.rows);
  const header = ["Lead #", "Claimant", "Campaign", "Created", ...rows.map((r) => r.q)];
  const l = b.lead;
  const row = [
    l.lead_no, l.claimant_name, b.claim?.campaign || l.campaign || "", l.created_at ? new Date(l.created_at).toLocaleDateString() : "",
    ...rows.map((r) => r.a === "—" ? "" : r.a),
  ];
  return [header.map(esc).join(","), row.map(esc).join(",")].join("\n");
}

