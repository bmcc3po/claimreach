import { supabaseServer } from "@/lib/supabase-server";

// Record an audit entry. Call from server routes after a meaningful change.
export async function recordAudit(opts: {
  firm_id: string;
  lead_id?: string;
  claim_id?: string;
  actor?: string;
  actor_name?: string;
  category?: string;
  description: string;
  meta?: any;
}) {
  const sb = await supabaseServer();
  await sb.from("audit_log").insert({
    firm_id: opts.firm_id,
    lead_id: opts.lead_id ?? null,
    claim_id: opts.claim_id ?? null,
    actor: opts.actor ?? null,
    actor_name: opts.actor_name ?? null,
    category: opts.category ?? "change",
    description: opts.description,
    meta: opts.meta ?? null,
  });
}
