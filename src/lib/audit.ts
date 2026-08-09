import { supabaseAdmin } from "@/lib/supabase-server";

// Record an audit entry to the Activity Log. Uses the admin client so RLS can't
// silently drop it. Never throws into the caller (logging must not break a save).
export async function recordAudit(opts: {
  firm_id?: string | null;
  lead_id?: string;
  claim_id?: string;
  actor?: string;
  actor_name?: string;
  category?: string;        // contact | retainer | status | call | note | system
  description: string;
  meta?: any;
}) {
  try {
    const sb = supabaseAdmin();
    await sb.from("audit_log").insert({
      firm_id: opts.firm_id ?? null,
      lead_id: opts.lead_id ?? null,
      claim_id: opts.claim_id ?? null,
      actor: opts.actor ?? null,
      actor_name: opts.actor_name ?? null,
      category: opts.category ?? "change",
      description: opts.description,
      meta: opts.meta ?? null,
    });
  } catch (e) {
    // swallow — auditing should never break the operation it records
    console.error("audit insert failed", e);
  }
}
