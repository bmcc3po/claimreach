import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireStaff, canHearRecordings } from "@/lib/mva-call/server";

export const runtime = "edge";

// GET /api/calls/comms?lead_id=
// Texts and calls on the file, oldest first, for the text sheet. Recordings
// and transcripts only go to owners, admins and managers.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const leadId = new URL(req.url).searchParams.get("lead_id") || "";
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const { data, error } = await sb.from("communications")
    .select("id, channel, direction, body, occurred_at, duration_sec, agent_name, recording_url, jc_summary, send_status")
    .eq("lead_id", leadId).order("occurred_at", { ascending: true }).limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hear = canHearRecordings(me.role);
  const rows = data ?? [];
  const texts = rows.filter((r: any) => r.channel === "sms").map((r: any) => ({
    id: r.id,
    from: r.direction === "inbound" ? "them" : "us",
    body: r.body || "",
    status: r.direction === "inbound" ? "" : (r.send_status === "failed" ? "Not delivered" : ""),
    at: r.occurred_at,
  }));
  const calls = rows.filter((r: any) => r.channel === "call" || r.channel === "voicemail").reverse().map((r: any) => ({
    id: r.id, channel: r.channel, direction: r.direction, occurred_at: r.occurred_at,
    duration_sec: r.duration_sec, agent_name: r.agent_name,
    recording_url: hear ? r.recording_url : null,
    jc_summary: hear ? r.jc_summary : null,
  }));
  return NextResponse.json({ texts, calls });
}
