import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
import { NETFLY_CAMPAIGN } from "@/lib/netfly-ontake";

export async function netflyContext() {
  const session = await supabaseServer();
  const actor = await gateUser(session);
  if (!actor || !["owner", "admin", "manager", "agent", "qa"].includes(actor.role)) return null;
  const db = supabaseAdmin();
  const { data: rows, error } = await db.from("campaigns")
    .select("id, firm_id, name, case_type, path, active, esign_required, ssn_require_full, firm_email, firm_cc, firms(slug)")
    .eq("name", NETFLY_CAMPAIGN).eq("case_type", "mva").eq("path", "secondary").eq("active", true).limit(2);
  if (error || rows?.length !== 1 || (rows[0].firms as any)?.slug !== "tmp" || rows[0].esign_required !== false) return null;
  const campaign = rows[0];
  if (actor.role !== "owner") {
    // Internal intake staff belong to the Innovative Intake organization,
    // while the matter itself belongs to TMP. Do not grant TMP firm logins,
    // partner identities, or staff attached to another intake organization.
    const { data: staffFirm } = await db.from("firms").select("slug").eq("id", actor.firmId).maybeSingle();
    if (staffFirm?.slug !== "inno") return null;
  }
  return { actor, db, campaign };
}

export async function netflyMatter(ctx: NonNullable<Awaited<ReturnType<typeof netflyContext>>>, key: string) {
  const identifier = String(key || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(identifier) && !/^TMP-\d{1,9}$/i.test(identifier)) return null;
  const field = identifier.startsWith("TMP-") ? "lead_no" : "id";
  const { data: lead, error: leadError } = await ctx.db.from("leads")
    .select("id, firm_id, intake_agent_id, campaign_id, case_type, lead_no, claimant_name, phone, email, mail_addr1, mail_city, mail_state, mail_zip, archived_at")
    .eq(field, identifier).eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id).is("archived_at", null).maybeSingle();
  if (leadError || !lead || lead.case_type !== "mva") return null;
  const { data: claims, error: claimError } = await ctx.db.from("claims")
    .select("id, lead_id, firm_id, campaign_id, claim_type, answers, status, updated_at")
    .eq("lead_id", lead.id).eq("firm_id", ctx.campaign.firm_id).eq("campaign_id", ctx.campaign.id).limit(2);
  if (claimError || claims?.length !== 1 || claims[0].claim_type !== "mva") return null;
  return { lead, claim: claims[0] };
}
