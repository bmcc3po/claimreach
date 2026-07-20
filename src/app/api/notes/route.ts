import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { lead_id, claim_id, scope, body } = await req.json();
  if (!body) return NextResponse.json({ error: "body required" }, { status: 400 });
  const { data, error } = await sb.from("notes").insert({
    firm_id: me.firm_id, lead_id, claim_id: claim_id ?? null,
    author: auth.user.id, author_name: me.full_name ?? "Staff",
    scope: scope ?? "file", body,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}
