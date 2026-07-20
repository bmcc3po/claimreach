import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { prebuiltTemplate } from "@/lib/case-templates";
import { CASE_PRESETS } from "@/lib/canonical-fields";
export const runtime = "edge";

async function me(sb: any) {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return null;
  const { data: u } = await sb.from("app_users").select("id, role, firm_id").eq("id", auth.user.id).maybeSingle();
  return u ? { ...u, uid: auth.user.id } : null;
}

// GET -> list case types + whether a template already exists
export async function GET() {
  const sb = await supabaseServer();
  const u = await me(sb);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: forms } = await sb.from("intake_forms").select("id, claim_type, name, status, is_template").eq("is_template", true);
  const existing = new Set((forms ?? []).map((f: any) => f.claim_type));
  const types = CASE_PRESETS.map((p) => ({ key: p.key, label: p.label, family: p.family, hasTemplate: existing.has(p.key) }));
  return NextResponse.json({ types, forms: forms ?? [] });
}

// POST { op:'seed', case_key } -> create the prebuilt template for a case type
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const u = await me(sb);
  if (!u || !["owner", "admin"].includes(u.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();

  if (b.op === "seed") {
    const fields = prebuiltTemplate(b.case_key);
    const preset = CASE_PRESETS.find((p) => p.key === b.case_key);
    const { data, error } = await sb.from("intake_forms").insert({
      firm_id: u.firm_id, claim_type: b.case_key, name: `${preset?.label ?? b.case_key} (template)`,
      description: "Prebuilt canonical template. Spine is locked; add campaign-specific extras below.",
      status: "draft", is_template: true, seeded_from_canon: true, family: preset?.family ?? "third_party",
      fields, created_by: u.uid,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (b.op === "seed_all") {
    const out: any[] = [];
    for (const p of CASE_PRESETS) {
      const { data: existing } = await sb.from("intake_forms").select("id").eq("claim_type", p.key).eq("is_template", true).maybeSingle();
      if (existing) continue;
      const fields = prebuiltTemplate(p.key);
      const { data } = await sb.from("intake_forms").insert({
        firm_id: u.firm_id, claim_type: p.key, name: `${p.label} (template)`,
        description: "Prebuilt canonical template.", status: "draft", is_template: true, seeded_from_canon: true,
        family: p.family, fields, created_by: u.uid,
      }).select("id").single();
      out.push({ key: p.key, id: data?.id });
    }
    return NextResponse.json({ ok: true, seeded: out });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
