import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

async function requireManager(sb: any) {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return { error: "unauthorized", status: 401 };
  const { data: me } = await sb.from("app_users").select("role, perm_overrides, firm_id").eq("id", auth.user.id).maybeSingle();
  const canManage = me && (["owner", "admin"].includes(me.role) || me.perm_overrides?.["users.manage"]);
  if (!canManage) return { error: "forbidden", status: 403 };
  return { me, uid: auth.user.id };
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const gate = await requireManager(sb);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { data } = await sb.from("app_users")
    .select("id, full_name, email, role, title, phone, active, perm_overrides, firm_id, created_at")
    .order("created_at", { ascending: false });
  return NextResponse.json({ users: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const gate = await requireManager(sb);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const me = (gate as any).me;
  const b = await req.json();
  const admin = supabaseAdmin();

  if (b.op === "create") {
    const email = (b.email || "").trim().toLowerCase();
    if (!email || !b.password) return NextResponse.json({ error: "email and password required" }, { status: 400 });
    // Create the auth user (confirmed) via the admin API.
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password: b.password, email_confirm: true,
    });
    if (cErr || !created?.user) return NextResponse.json({ error: cErr?.message || "could not create auth user" }, { status: 500 });
    // Create the app_users profile row.
    const { error: pErr } = await admin.from("app_users").insert({
      id: created.user.id, email, full_name: b.full_name ?? email,
      role: b.role ?? "agent", title: b.title ?? null, phone: b.phone ?? null,
      firm_id: b.firm_id ?? me.firm_id, perm_overrides: b.perm_overrides ?? {}, active: true,
    });
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: created.user.id });
  }

  if (b.op === "update") {
    const patch: Record<string, any> = {};
    for (const k of ["full_name", "role", "title", "phone", "active", "perm_overrides", "firm_id"]) if (k in b) patch[k] = b[k];
    const { error } = await admin.from("app_users").update(patch).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b.op === "set_password") {
    if (!b.id || !b.password) return NextResponse.json({ error: "id and password required" }, { status: 400 });
    const { error } = await admin.auth.admin.updateUserById(b.id, { password: b.password });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b.op === "deactivate") {
    await admin.from("app_users").update({ active: false }).eq("id", b.id);
    // Optionally ban at auth level so they can't log in.
    try { await admin.auth.admin.updateUserById(b.id, { ban_duration: "876000h" }); } catch {}
    return NextResponse.json({ ok: true });
  }
  if (b.op === "reactivate") {
    await admin.from("app_users").update({ active: true }).eq("id", b.id);
    try { await admin.auth.admin.updateUserById(b.id, { ban_duration: "none" }); } catch {}
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
