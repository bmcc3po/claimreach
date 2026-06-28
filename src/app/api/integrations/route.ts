import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { newKeyPair } from "@/lib/webhooks";
export const runtime = "edge";

async function gate() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await sb.from("app_users").select("role, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) return null;
  return { sb, me, uid: auth.user.id };
}

export async function GET() {
  const g = await gate();
  if (!g) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = supabaseAdmin();
  const { data: keys } = await admin.from("api_keys").select("id, firm_id, label, key_id, scope, active, last_used_at, created_at").order("created_at", { ascending: false });
  const { data: endpoints } = await admin.from("webhook_endpoints").select("id, firm_id, url, events, active, created_at").order("created_at", { ascending: false });
  const { data: events } = await admin.from("webhook_events").select("id, firm_id, direction, event_type, status, http_status, created_at").order("created_at", { ascending: false }).limit(50);
  const { data: firms } = await admin.from("firms").select("id, name").order("name");
  return NextResponse.json({ keys: keys ?? [], endpoints: endpoints ?? [], events: events ?? [], firms: firms ?? [] });
}

export async function POST(req: NextRequest) {
  const g = await gate();
  if (!g) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = supabaseAdmin();
  const b = await req.json();

  if (b.op === "create_key") {
    const scope = b.scope === "master" ? "master" : "firm";
    const { key_id, secret } = newKeyPair(scope);
    const { error } = await admin.from("api_keys").insert({
      firm_id: scope === "master" ? null : b.firm_id, label: b.label || "API key", key_id, secret, scope, created_by: g.uid,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // secret shown ONCE here
    return NextResponse.json({ ok: true, key_id, secret });
  }
  if (b.op === "revoke_key") {
    await admin.from("api_keys").update({ active: false }).eq("id", b.id);
    return NextResponse.json({ ok: true });
  }
  if (b.op === "create_endpoint") {
    const secret = "whs_" + Array.from(crypto.getRandomValues(new Uint8Array(20))).map((x) => x.toString(16).padStart(2, "0")).join("");
    const { error } = await admin.from("webhook_endpoints").insert({
      firm_id: b.firm_id, url: b.url, secret, events: b.events ?? [], created_by: g.uid,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, secret });
  }
  if (b.op === "revoke_endpoint") {
    await admin.from("webhook_endpoints").update({ active: false }).eq("id", b.id);
    return NextResponse.json({ ok: true });
  }
  if (b.op === "save_mapping") {
    const { data: existing } = await admin.from("field_mappings").select("id").eq("firm_id", b.firm_id).eq("direction", b.direction || "inbound").maybeSingle();
    if (existing) await admin.from("field_mappings").update({ map: b.map ?? {}, transforms: b.transforms ?? {} }).eq("id", existing.id);
    else await admin.from("field_mappings").insert({ firm_id: b.firm_id, direction: b.direction || "inbound", map: b.map ?? {}, transforms: b.transforms ?? {} });
    return NextResponse.json({ ok: true });
  }
  if (b.op === "save_justcall") {
    const { error } = await admin.from("justcall_accounts").insert({ firm_id: b.firm_id || null, label: b.label || "JustCall", api_key: b.api_key, api_secret: b.api_secret });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
