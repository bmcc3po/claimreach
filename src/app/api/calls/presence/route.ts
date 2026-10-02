import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { resolveSigningMatter } from "@/lib/mva-call/signing-matter";
import { activeCallPresence } from "@/lib/call-presence";

export const runtime = "edge";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

async function context(leadId: string, claimId: string) {
  const session = await supabaseServer();
  const actor = await requireStaff(session);
  if (!actor) return { error: "Staff access required.", status: 403 } as const;
  if (actor.role !== "owner") {
    const { data: staffFirm } = await supabaseAdmin().from("firms").select("slug").eq("id", actor.firmId).maybeSingle();
    if (staffFirm?.slug !== "inno") return { error: "INNO MVA is unavailable to this account.", status: 403 } as const;
  }
  const matter = await resolveSigningMatter(session, leadId, { claimId });
  if (!matter.ok) return { error: matter.error, status: matter.status } as const;
  if (matter.matter.claim.claim_type !== "mva" || !matter.campaignId) return { error: "This is not an INNO MVA matter.", status: 404 } as const;
  const { data: campaign, error } = await supabaseAdmin().from("campaigns")
    .select("id, firm_id, name, case_type, active, firms(slug)")
    .eq("id", matter.campaignId).eq("firm_id", matter.lead.firm_id).maybeSingle();
  if (error || !campaign || campaign.name !== "INNO MVA" || campaign.case_type !== "mva" || campaign.active !== true || (campaign.firms as any)?.slug !== "tmp")
    return { error: "This is not an active INNO MVA matter.", status: 404 } as const;
  return { actor, matter, campaign } as const;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ctx = await context(url.searchParams.get("lead_id") || "", url.searchParams.get("claim_id") || "");
  if ("error" in ctx) return fail(ctx.error || "INNO MVA is unavailable.", ctx.status || 403);
  const { data, error } = await supabaseAdmin().from("claims").select("answers")
    .eq("id", ctx.matter.matter.claim.id).eq("lead_id", ctx.matter.lead.id)
    .eq("firm_id", ctx.matter.lead.firm_id).eq("campaign_id", ctx.campaign.id).maybeSingle();
  if (error || !data) return fail("Could not check who is on the phone.", 503);
  return NextResponse.json({ actor_id: ctx.actor.id, live_call: activeCallPresence((data.answers as any)?.mva_live_call) });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return fail("Invalid request.", 400); }
  const action = String(body?.action || "");
  if (!["start", "refresh", "end"].includes(action)) return fail("Choose a call-presence action.", 400);
  const ctx = await context(String(body?.lead_id || ""), String(body?.claim_id || ""));
  if ("error" in ctx) return fail(ctx.error || "INNO MVA is unavailable.", ctx.status || 403);
  const db = supabaseAdmin();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: current, error } = await db.from("claims").select("answers, updated_at")
      .eq("id", ctx.matter.matter.claim.id).eq("lead_id", ctx.matter.lead.id)
      .eq("firm_id", ctx.matter.lead.firm_id).eq("campaign_id", ctx.campaign.id).maybeSingle();
    if (error || !current) return fail("Could not check who is on this call.", 503);
    const answers = current.answers && typeof current.answers === "object" && !Array.isArray(current.answers)
      ? current.answers as Record<string, unknown> : {};
    const active = activeCallPresence(answers.mva_live_call);
    if (active && active.by !== ctx.actor.id) return fail(`${active.by_name} is already marked on the phone with this client.`, 409);
    if (action !== "start" && active?.by !== ctx.actor.id) return fail("Your call indicator expired. Start it again if you are still speaking with this client.", 409);
    const live_call = action === "end" ? null : { by: ctx.actor.id, by_name: ctx.actor.name,
      expires_at: new Date(Date.now() + 90_000).toISOString() };
    let update = db.from("claims")
      .update({ answers: { ...answers, mva_live_call: live_call }, updated_at: new Date().toISOString() })
      .eq("id", ctx.matter.matter.claim.id).eq("lead_id", ctx.matter.lead.id)
      .eq("firm_id", ctx.matter.lead.firm_id).eq("campaign_id", ctx.campaign.id);
    update = current.updated_at == null ? update.is("updated_at", null) : update.eq("updated_at", current.updated_at);
    const { data: updated, error: saveError } = await update.select("id").maybeSingle();
    if (saveError) return fail("Call indicator did not save. Retry.", 503);
    if (updated) return NextResponse.json({ actor_id: ctx.actor.id, live_call });
  }
  return fail("Another agent updated this file. Refresh and retry.", 409);
}
