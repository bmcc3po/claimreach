import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { assertM6Write } from "@/lib/m6-scope";
export const runtime = "edge";

// One shared thread. Both firms read and write it, which is the whole point:
// if TMP calls a client and Innovative cannot see it, the client gets called
// twice and the reachability number lies.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const { lead_id, body } = b ?? {};
  if (!lead_id || !String(body ?? "").trim()) {
    return NextResponse.json({ error: "Write something first." }, { status: 400 });
  }

  const gate = await assertM6Write(sb, lead_id, "id, firm_id, campaign, case_type, archived_at");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { error } = await sb.from("lead_notes").insert({
    firm_id: gate.lead.firm_id, lead_id, author: gate.user.id,
    body: String(body).trim(), source: "m6",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
