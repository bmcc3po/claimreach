import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { normPhone } from "@/lib/comms";

export const runtime = "edge";
export const dynamic = "force-dynamic";

async function allowedLeads(ids: string[]) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return { status: 401 as const, error: "unauthorized" };
  if (!me.can("intake.fill")) return { status: 403 as const, error: "forbidden" };
  const { data, error } = await sb.from("leads").select("id, phone_norm").in("id", ids).is("archived_at", null);
  if (error) return { status: 503 as const, error: "Could not verify file access." };
  return { me, leads: data || [] };
}

export async function GET(req: NextRequest) {
  const raw = (new URL(req.url).searchParams.get("ids") || "").split(",").filter(Boolean);
  const ids = [...new Set(raw)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (!ids.length) return NextResponse.json({ presence: {} });
  const scope = await allowedLeads(ids);
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const phones = [...new Set(scope.leads.map((l: any) => String(l.phone_norm || "")).filter((p) => p.length === 10))];
  if (!phones.length) return NextResponse.json({ presence: {} });
  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const [{ data: live, error: liveError }, { data: held, error: heldError }] = await Promise.all([
    admin.from("cr_call_presence").select("phone_norm, state, agent_name, expires_at").in("phone_norm", phones).is("ended_at", null).gt("expires_at", now),
    admin.from("cr_call_reservations").select("phone_norm, agent_name, expires_at").in("phone_norm", phones).gt("expires_at", now),
  ]);
  if (liveError || heldError) return NextResponse.json({ error: "Could not check live calls. Try again before dialing." }, { status: 503 });
  const byPhone: Record<string, { state: string; agent: string }> = {};
  for (const row of held || []) byPhone[row.phone_norm] = { state: "starting", agent: row.agent_name || "another agent" };
  for (const row of live || []) {
    if (!byPhone[row.phone_norm] || row.state === "connected") byPhone[row.phone_norm] = { state: row.state, agent: row.agent_name || "another agent" };
  }
  return NextResponse.json({ presence: Object.fromEntries(scope.leads.filter((l: any) => byPhone[l.phone_norm]).map((l: any) => [l.id, byPhone[l.phone_norm]])) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = String(body?.lead_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "File required." }, { status: 400 });
  const scope = await allowedLeads([id]);
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const lead = scope.leads.find((l: any) => l.id === id);
  const phone = normPhone(body?.phone);
  if (!lead || phone.length !== 10 || phone !== lead.phone_norm) {
    return NextResponse.json({ error: "Save the client's current phone on this file before dialing." }, { status: 409 });
  }
  const { data, error } = await supabaseAdmin().rpc("cr_reserve_call_phone", {
    p_phone: phone, p_agent_id: scope.me.id, p_agent_name: scope.me.name || "another agent",
  });
  if (error) return NextResponse.json({ error: "Could not reserve this call. Do not dial until it can be checked." }, { status: 503 });
  if (!data?.reserved) return NextResponse.json({ error: `${data?.agent_name || "Another agent"} is ${data?.state === "connected" ? "talking to" : data?.state === "ringing" ? "calling" : "starting a call to"} this client.`, presence: data }, { status: 409 });
  return NextResponse.json({ reserved: true });
}
