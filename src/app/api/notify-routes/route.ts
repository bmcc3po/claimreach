import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { cleanEmails } from "@/lib/notify-signed";
import { caseName } from "@/lib/case-name";

export const runtime = "edge";

// Who gets an email when a client signs (Settings > When a client signs).
// GET  -> every case type with its distro, and every campaign with its CCs.
// POST { case_type, to }        sets the distro for a case type ("" clears it)
// POST { campaign_id, cc }      sets a campaign's CCs ("" clears them)
// Staff can look; owners and admins change it. Reads and writes go through
// the signed-in user, so RLS (is_internal) decides, same as esign_submissions.

const EVENT = "signed";
const missingTable = (e: any) => e && (e.code === "42P01" || /notify_routes/.test(String(e.message || "")));

export async function GET() {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: camps } = await sb.from("campaigns").select("id, name, case_type, active, firms(name)").order("name");
  const { data: routes, error } = await sb.from("notify_routes").select("id, case_type, campaign_id, to_emails, cc_emails").eq("event", EVENT);
  if (error && missingTable(error)) return NextResponse.json({ needsMigration: true, canEdit: false, groups: [] });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const types = Array.from(new Set((camps ?? []).map((c: any) => c.case_type).filter(Boolean))) as string[];
  const groups = types.map((t) => {
    const rule = (routes ?? []).find((r: any) => !r.campaign_id && r.case_type === t);
    return {
      caseType: t,
      label: caseName(null, t),
      to: (rule?.to_emails ?? []).join(", "),
      campaigns: (camps ?? []).filter((c: any) => c.case_type === t).map((c: any) => {
        const cr = (routes ?? []).find((r: any) => r.campaign_id === c.id);
        return { id: c.id, name: c.name, firm: c.firms?.name ?? "", active: c.active !== false, cc: (cr?.cc_emails ?? []).join(", ") };
      }),
    };
  });
  return NextResponse.json({ canEdit: ["owner", "admin"].includes(me.role), groups });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "Only an owner or admin can change who gets these." }, { status: 403 });

  const b = await req.json().catch(() => null);
  const campaignId = String(b?.campaign_id || "") || null;
  const caseType = String(b?.case_type || "") || null;
  if (!campaignId && !caseType) return NextResponse.json({ error: "Pick a case type or a campaign." }, { status: 400 });

  const raw = String((campaignId ? b?.cc : b?.to) ?? "");
  const emails = cleanEmails(raw);
  const bad = raw.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean).filter((x) => !cleanEmails(x).length);
  if (bad.length) return NextResponse.json({ error: `That doesn't look like an email address: ${bad.join(", ")}` }, { status: 400 });

  let find = sb.from("notify_routes").select("id").eq("event", EVENT);
  let row: Record<string, any>;
  if (campaignId) {
    const { data: camp } = await sb.from("campaigns").select("id, case_type").eq("id", campaignId).maybeSingle();
    if (!camp) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    find = find.eq("campaign_id", campaignId);
    row = { event: EVENT, campaign_id: campaignId, case_type: camp.case_type, cc_emails: emails, to_emails: [] };
  } else {
    find = find.is("campaign_id", null).eq("case_type", caseType);
    row = { event: EVENT, campaign_id: null, case_type: caseType, to_emails: emails, cc_emails: [] };
  }
  const { data: have, error: findErr } = await find.limit(1).maybeSingle();
  if (findErr) return NextResponse.json({ error: missingTable(findErr) ? "Run migration 0099 first." : findErr.message }, { status: 500 });

  const now = new Date().toISOString();
  const { error } = have
    ? await sb.from("notify_routes").update({ ...row, active: true, updated_at: now }).eq("id", have.id)
    : await sb.from("notify_routes").insert({ ...row, created_by: me.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, saved: emails.join(", ") });
}
