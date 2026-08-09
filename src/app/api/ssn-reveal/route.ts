import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAudit } from "@/lib/audit";
export const runtime = "edge";

// POST { lead_id } — returns SSN and LOGS the reveal to the audit trail.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role === "firm") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { lead_id } = await req.json();
  const { data: lead } = await sb.from("leads").select("firm_id, ssn_enc, ssn_last4, claimant_name").eq("id", lead_id).maybeSingle();
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Log the reveal — who, when, which file.
  await recordAudit({
    firm_id: lead.firm_id, lead_id,
    actor: auth.user.id, actor_name: me.full_name ?? "Staff",
    category: "access", description: `Revealed SSN for ${lead.claimant_name ?? "claimant"}`,
  });

  // In production ssn_enc would be decrypted here; for now return last4-based display.
  const ssn = lead.ssn_enc ?? (lead.ssn_last4 ? `•••-••-${lead.ssn_last4}` : "(not on file)");
  return NextResponse.json({ ssn });
}
