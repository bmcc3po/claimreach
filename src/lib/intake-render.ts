// ============================================================================
// Shared intake renderers. Build a single claimant's intake as PDF bytes or as
// a one-row CSV, from the resolved questionnaire. Used by the export routes and
// by firm delivery so there is one source of truth for the artifact shape.
// ============================================================================
import { supabaseAdmin } from "@/lib/supabase-server";

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
async function resolveFields(sb: any, caseType: string): Promise<any[]> {
  let fields: any[] = [];
  try { const { resolveIntakeFields } = await import("@/lib/forms"); fields = await resolveIntakeFields(sb, caseType); } catch {}
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

// Load everything needed to render one lead's intake.
export async function loadIntakeBundle(sb: any, leadId: string): Promise<IntakeBundle | null> {
  const admin = supabaseAdmin();
  const { data: lead } = await admin.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) return null;
  const { data: claim } = await admin.from("claims").select("answers, claim_type, campaign").eq("lead_id", leadId).limit(1).maybeSingle();
  const answers = claim?.answers ?? {};
  const caseType = (claim?.claim_type || lead.case_type || "").toLowerCase();
  const fields = await resolveFields(sb, caseType);
  return { lead, claim, answers, caseType, fields };
}

// Build a clean intake PDF (every question + answer) for one claimant.
export async function buildIntakePdf(b: IntakeBundle): Promise<Uint8Array> {
  const { lead, claim, answers, caseType, fields } = b;
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const M = 54; const W = 612; const H = 792; const wrapW = W - M * 2;
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
      y -= size + 4;
    }
  }

  page.drawText("CLAIM INTAKE", { x: M, y, size: 20, font: bold, color: ink }); y -= 26;
  draw(lead.claimant_name || "Unnamed claimant", bold, 14, ink);
  draw(`${lead.lead_no || ""}   ·   ${claim?.campaign || lead.campaign || ""}   ·   ${caseType}`, font, 10, soft);
  draw(`Exported ${new Date().toLocaleString()}`, font, 9, soft);
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: rgb(0.9, 0.92, 0.95) }); y -= 18;

  for (const f of fields) {
    if (f.kind === "section") { y -= 6; draw(String(f.label || "").toUpperCase(), bold, 11, accent); y -= 2; continue; }
    if (SKIP_KINDS.includes(f.kind)) continue;
    draw(f.label || f.id, bold, 10.5, ink);
    draw(answerText(f, lead, answers), font, 10.5, rgb(0.15, 0.18, 0.24), 10);
    y -= 6;
  }
  return await pdf.save();
}

// Build a one-row CSV (header + this claimant's answers) for one claimant.
export function buildIntakeCsvSingle(b: IntakeBundle): string {
  const esc = (v: any): string => {
    const s = v === undefined || v === null ? "" : Array.isArray(v) ? v.join("; ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const cols = b.fields.filter((f) => !SKIP_KINDS.includes(f.kind));
  const header = ["Lead #", "Claimant", "Campaign", "Created", ...cols.map((f) => f.label || f.id)];
  const l = b.lead;
  const row = [
    l.lead_no, l.claimant_name, l.campaign || b.claim?.campaign || "", l.created_at ? new Date(l.created_at).toLocaleDateString() : "",
    ...cols.map((f) => displayValue(f, resolveRaw(f, l, b.answers), "")),
  ];
  return [header.map(esc).join(","), row.map(esc).join(",")].join("\n");
}
