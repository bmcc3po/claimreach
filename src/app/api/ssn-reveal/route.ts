import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
import { recordAudit } from "@/lib/audit";
export const runtime = "edge";

// POST { lead_id } — last-4 mask only, logged. Never returns ssn_enc (ciphertext
// or plaintext). Firm is blocked even though leads.view is in the firm default set.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const user = await gateUser(sb);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role === "firm" || !user.can("leads.view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { lead_id } = await req.json();
  const { data: lead } = await sb.from("leads").select("firm_id, ssn_last4, claimant_name").eq("id", lead_id).maybeSingle();
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit({
    firm_id: lead.firm_id, lead_id,
    actor: user.id, actor_name: user.name ?? "Staff",
    category: "access", description: `Revealed SSN for ${lead.claimant_name ?? "claimant"}`,
  });

  const last4 = lead.ssn_last4 ? String(lead.ssn_last4).replace(/\D/g, "").slice(-4) : "";
  const ssn = last4 ? `•••-••-${last4}` : "(not on file)";
  return NextResponse.json({ ssn });
}
