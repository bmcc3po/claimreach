import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

// Given a campaign (or a single retainer), return which INTAKE field ids its
// retainer autofills, and a human label for what each feeds. The intake form uses
// this to purple-border those questions so agents answer them with extra care.
// Source of truth = the retainer field mappings themselves (no separate flag).

function collectFromPdfFields(fields: any[], feeds: Record<string, string[]>) {
  for (const f of fields || []) {
    const m = f.mapTo || "";
    if (!m) continue;
    // Key intake fields by their bare id; contact/case fields by their full token.
    const key = m.startsWith("intake.") ? m.slice("intake.".length) : m;
    (feeds[key] ||= []).push(f.label || f.type || "retainer field");
  }
}
function collectFromBody(body: string, feeds: Record<string, string[]>) {
  const re = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(body || ""))) {
    let key = mm[1];
    if (key === "today") continue;
    if (key.startsWith("intake.")) key = key.slice("intake.".length);
    (feeds[key] ||= []).push("retainer text");
  }
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = supabaseAdmin();

  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign_id");
  if (!campaignId) return NextResponse.json({ feeds: {} });

  const { data: c } = await admin.from("campaigns").select("retainer_packet, retainer_template_id").eq("id", campaignId).maybeSingle();
  if (!c) return NextResponse.json({ feeds: {} });

  // Build the list of retainer docs this campaign sends: packet + default fallback.
  let docs: { kind: string; id: string }[] = Array.isArray(c.retainer_packet) ? c.retainer_packet : [];
  if (docs.length === 0 && c.retainer_template_id) {
    const { data: isPdf } = await admin.from("pdf_templates").select("id").eq("id", c.retainer_template_id).maybeSingle();
    docs = [{ kind: isPdf ? "pdf" : "text", id: c.retainer_template_id }];
  }

  const feeds: Record<string, string[]> = {};
  for (const d of docs) {
    if (d.kind === "pdf") {
      const { data: p } = await admin.from("pdf_templates").select("fields").eq("id", d.id).maybeSingle();
      if (p?.fields) collectFromPdfFields(p.fields, feeds);
    } else {
      const { data: t } = await admin.from("retainer_templates").select("body").eq("id", d.id).maybeSingle();
      if (t?.body) collectFromBody(t.body, feeds);
    }
  }

  // Flatten feed labels to a short string per field id.
  const out: Record<string, string> = {};
  for (const [id, labels] of Object.entries(feeds)) {
    const uniq = Array.from(new Set(labels));
    out[id] = uniq.slice(0, 2).join(", ") + (uniq.length > 2 ? "…" : "");
  }
  return NextResponse.json({ feeds: out });
}
