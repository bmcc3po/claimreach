import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// GET            -> list all forms (internal)
// GET ?type=pfas -> the published form for a claim type (used by the renderer)
// POST {op:'save'|'publish'|'unpublish'|'delete', ...}
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const type = new URL(req.url).searchParams.get("type");
  if (type) {
    const { data } = await sb.from("intake_forms")
      .select("*").eq("claim_type", type).eq("status", "published")
      .order("version", { ascending: false }).limit(1).maybeSingle();
    return NextResponse.json({ form: data ?? null });
  }
  const { data } = await sb.from("intake_forms").select("*").order("updated_at", { ascending: false });
  return NextResponse.json({ forms: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();

  if (b.op === "save") {
    const row: Record<string, any> = {
      firm_id: me.firm_id, claim_type: b.claim_type, name: b.name,
      description: b.description ?? null, fields: b.fields ?? [], status: "draft",
    };
    if (b.id) {
      const { error } = await sb.from("intake_forms").update(row).eq("id", b.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, id: b.id });
    }
    row.created_by = auth.user.id;
    const { data, error } = await sb.from("intake_forms").insert(row).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (b.op === "publish") {
    const { error } = await sb.from("intake_forms").update({ status: "published" }).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.op === "unpublish") {
    const { error } = await sb.from("intake_forms").update({ status: "draft" }).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.op === "delete") {
    const { error } = await sb.from("intake_forms").delete().eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
