import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
export const runtime = "edge";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "firm";
}

export async function GET() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data } = await sb.from("firms").select("id, name, slug, lead_prefix, created_at").order("name");
  return NextResponse.json({ firms: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json();
  const admin = supabaseAdmin();
  const name = (b.name || "").trim();
  if (!name) return NextResponse.json({ error: "Firm name is required." }, { status: 200 });

  // Prefix: uppercase letters/numbers, 2-5 chars. Vanity only.
  let prefix = (b.lead_prefix || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  if (prefix.length < 2) return NextResponse.json({ error: "Prefix must be 2 to 5 letters (e.g. TMP, WLL)." }, { status: 200 });

  // Prefix should be unique so IDs read clean, though the global number is the
  // real key so a clash would not break anything.
  const { data: clash } = await admin.from("firms").select("id").eq("lead_prefix", prefix).neq("id", b.id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
  if (clash) return NextResponse.json({ error: `Prefix ${prefix} is already used by another firm.` }, { status: 200 });

  if (b.id) {
    const { error } = await admin.from("firms").update({ name, lead_prefix: prefix }).eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: b.id });
  }
  const { data, error } = await admin.from("firms").insert({ name, slug: slugify(name), lead_prefix: prefix }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
