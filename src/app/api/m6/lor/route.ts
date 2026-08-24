import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { assertM6Write } from "@/lib/m6-scope";
import { isLorStatus, type LorStatus } from "@/lib/m6";
import { lorFactsPatch } from "@/lib/m6-lor";
import { LOR_LEAD_COLS, previewPayload } from "@/lib/m6-lor-server";
export const runtime = "edge";

const SENT_TO = ["g6", "franchisee", "motel6", "sedgwick", "other"] as const;

async function previewFor(sb: any, leadId: string, firmId: string) {
  const admin = supabaseAdmin();
  const [{ data: lead }, { data: lor }] = await Promise.all([
    admin.from("leads").select(LOR_LEAD_COLS).eq("id", leadId).eq("firm_id", firmId).maybeSingle(),
    sb.from("lead_lor").select("lead_id, status, flagged_today, sent_on, sent_to")
      .eq("lead_id", leadId).eq("firm_id", firmId).maybeSingle(),
  ]);
  if (!lead) return null;
  return previewPayload(lead, lor, sb);
}

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const leadId = new URL(req.url).searchParams.get("lead_id") || "";
  if (!leadId) return NextResponse.json({ error: "Missing the file." }, { status: 400 });
  const gate = await assertM6Write(sb, leadId, LOR_LEAD_COLS);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { data: lor } = await sb.from("lead_lor")
    .select("lead_id, status, flagged_today, sent_on, sent_to")
    .eq("lead_id", leadId).eq("firm_id", gate.lead.firm_id).maybeSingle();
  return NextResponse.json(await previewPayload(gate.lead, lor, sb));
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }

  const { lead_id, status, flagged_today, sent_on, sent_to, facts } = b ?? {};
  if (!lead_id) return NextResponse.json({ error: "Missing the file." }, { status: 400 });

  const hasFacts = facts && typeof facts === "object" && !Array.isArray(facts);
  const hasStatus = status != null && status !== "";
  if (!hasFacts && !hasStatus) {
    return NextResponse.json({ error: "Pick an LOR status." }, { status: 400 });
  }
  if (hasStatus && !isLorStatus(status)) {
    return NextResponse.json({ error: "Pick an LOR status." }, { status: 400 });
  }
  if (sent_to != null && sent_to !== "" && !SENT_TO.includes(sent_to)) {
    return NextResponse.json({ error: "Pick who it went to." }, { status: 400 });
  }

  let sentOn: string | null = null;
  if (sent_on) {
    const d = new Date(sent_on);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "That date did not make sense. Use YYYY-MM-DD." }, { status: 400 });
    }
    sentOn = String(sent_on).slice(0, 10);
  }

  const gate = await assertM6Write(sb, lead_id, LOR_LEAD_COLS);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  if (hasFacts) {
    const patch = lorFactsPatch(gate.lead, facts);
    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin()
        .from("leads")
        .update(patch)
        .eq("id", lead_id)
        .eq("firm_id", gate.lead.firm_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (hasStatus) {
    const st: LorStatus = status;
    const flagged = st === "sent" || st === "received"
      ? false
      : (flagged_today === true || st === "ready");

    const { error } = await sb.from("lead_lor").upsert({
      lead_id,
      firm_id: gate.lead.firm_id,
      status: st,
      flagged_today: flagged,
      sent_on: sentOn,
      sent_to: sent_to || null,
      updated_at: new Date().toISOString(),
      updated_by: gate.user.id,
    }, { onConflict: "lead_id" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (hasFacts) {
    const preview = await previewFor(sb, lead_id, gate.lead.firm_id);
    if (!preview) return NextResponse.json({ ok: true });
    return NextResponse.json({ ok: true, ...preview });
  }
  return NextResponse.json({ ok: true });
}
