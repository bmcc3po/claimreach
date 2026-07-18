import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

// GET /api/export/intake-pdf?lead_id=... -> a clean PDF of one claimant's full
// intake (every question and its answer), for handoff to the firm.

const SKIP_KINDS = ["section", "script", "gate"];

// Choice fields store a code ("le30"); the firm needs to read the words the
// caller actually heard ("Within the last 30 days"). Fields generated from the
// console carry a choices value->label map for exactly this.
function labelFor(field: any, v: any): string {
  const hit = Array.isArray(field?.choices) ? field.choices.find((c: any) => c.value === v) : null;
  return hit ? hit.label : String(v);
}

function answerText(field: any, leadRow: any, answers: Record<string, any>): string {
  const raw = field.scope === "lead" ? leadRow?.[field.id] : answers?.[field.id];
  if (raw === undefined || raw === null || raw === "") return "—";
  if (Array.isArray(raw)) return raw.map((v) => labelFor(field, v)).join(", ");
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  return labelFor(field, raw);
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const leadId = new URL(req.url).searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: lead } = await admin.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });
  const { data: claim } = await admin.from("claims").select("answers, claim_type, campaign").eq("lead_id", leadId).limit(1).maybeSingle();
  const answers = claim?.answers ?? {};
  const caseType = (claim?.claim_type || lead.case_type || "").toLowerCase();

  // Resolve the questionnaire (published custom form first, else preset).
  let fields: any[] = [];
  try { const { resolveIntakeFields } = await import("@/lib/forms"); fields = await resolveIntakeFields(sb, caseType); } catch {}
  if (!fields || fields.length === 0) { try { const { intakeForType } = await import("@/lib/questionnaire"); fields = intakeForType(caseType) as any[]; } catch {} }

  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const M = 54; const W = 612; const H = 792; const wrapW = W - M * 2;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ink = rgb(0.07, 0.1, 0.16); const soft = rgb(0.4, 0.45, 0.53); const accent = rgb(0.85, 0.6, 0.16);
  const line = (n = 1) => { y -= 14 * n; if (y < M + 40) { page = pdf.addPage([W, H]); y = H - M; } };

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

  // Header
  page.drawText("CLAIM INTAKE", { x: M, y, size: 20, font: bold, color: ink }); y -= 26;
  draw(lead.claimant_name || "Unnamed claimant", bold, 14, ink);
  draw(`${lead.lead_no || ""}   ·   ${claim?.campaign || lead.campaign || ""}   ·   ${caseType}`, font, 10, soft);
  draw(`Exported ${new Date().toLocaleString()}`, font, 9, soft);
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: rgb(0.9, 0.92, 0.95) }); y -= 18;

  // Questions and answers, grouped by section.
  for (const f of fields) {
    if (f.kind === "section") { y -= 6; draw(String(f.label || "").toUpperCase(), bold, 11, accent); y -= 2; continue; }
    if (SKIP_KINDS.includes(f.kind)) continue;
    draw(f.label || f.id, bold, 10.5, ink);
    draw(answerText(f, lead, answers), font, 10.5, rgb(0.15, 0.18, 0.24), 10);
    y -= 6;
  }

  const bytes = await pdf.save();
  const safeName = (lead.claimant_name || lead.lead_no || "intake").replace(/[^a-z0-9]+/gi, "_");
  return new Response(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}_intake.pdf"`,
    },
  });
}
