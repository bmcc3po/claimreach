import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// One shared thread. Both firms read and write it, which is the whole point:
// if TMP calls a client and Innovative cannot see it, the client gets called
// twice and the reachability number lies.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again to save this." }, { status: 401 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const { lead_id, body } = b ?? {};
  if (!lead_id || !String(body ?? "").trim()) {
    return NextResponse.json({ error: "Write something first." }, { status: 400 });
  }

  const { data: lead } = await sb.from("leads").select("id, firm_id").eq("id", lead_id).maybeSingle();
  if (!lead) return NextResponse.json({ error: "That file is not available to you." }, { status: 404 });

  const { error } = await sb.from("lead_notes").insert({
    firm_id: lead.firm_id, lead_id, author: user.id,
    body: String(body).trim(), source: "m6",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
