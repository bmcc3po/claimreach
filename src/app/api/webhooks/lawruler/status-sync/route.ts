import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { previewLawRulerRecovery } from "@/lib/lawruler-recovery";
import { applyLawRulerRecovery, type LrRecoverySelection } from "@/lib/lawruler-recovery-apply";
export const runtime = "edge";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (body: any, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function operator(write = false) {
  const me = await requireStaff(await supabaseServer());
  return me && ["owner", "admin"].includes(me.role) && me.can("settings.manage") && me.can("leads.view") && (!write || me.can("claims.status")) ? me : null;
}

// A GET is a firm-scoped preview only. It never changes records or contacts anyone.
export async function GET(req: NextRequest) {
  if (!await operator()) return reply({ error: "Owners and admins only." }, 403);
  const q = new URL(req.url).searchParams;
  const firmId = q.get("firm_id") || "", leadId = q.get("lead_id") || undefined, cursor = q.get("cursor") || undefined;
  if (!UUID.test(firmId) || (leadId && !UUID.test(leadId)) || (cursor && !UUID.test(cursor))) return reply({ error: "Select a firm and valid optional file/cursor identifiers." }, 400);
  try { return reply(await previewLawRulerRecovery(supabaseAdmin(), { firmId, leadId, cursor, limit: Number(q.get("limit")) || 50 })); }
  catch (error) { return reply({ error: error instanceof Error ? error.message : "Could not load recovery preview." }, 500); }
}

// A separately reviewed, exact selection. No blanket sync and no implicit mapping.
export async function POST(req: NextRequest) {
  const me = await operator(true);
  if (!me) return reply({ error: "Owners and admins only." }, 403);
  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > 100000) return reply({ error: "Recovery selection is too large." }, 413);
    body = JSON.parse(raw);
  } catch { return reply({ error: "Supply a JSON recovery selection." }, 400); }
  const selections = body?.selections as LrRecoverySelection[];
  if (!UUID.test(body?.firm_id || "") || !Array.isArray(selections) || !selections.length || selections.length > 50 || selections.some(s =>
    !s || !UUID.test(s.lead_id || "") || !UUID.test(s.claim_id || "") ||
    !Object.prototype.hasOwnProperty.call(s, "expected_status") || (s.expected_status !== null && typeof s.expected_status !== "string") ||
    typeof s.source_status !== "string" || !s.source_status.trim() || typeof s.status !== "string" || !s.status.trim() ||
    (s.mapping_note != null && typeof s.mapping_note !== "string") || (s.dq_reason_key != null && typeof s.dq_reason_key !== "string")
  )) return reply({ error: "Select 1-50 exact matters with their previewed source and current status." }, 400);
  if (new Set(selections.map(s => s.claim_id)).size !== selections.length) return reply({ error: "A matter may appear only once in a selection." }, 400);
  try {
    const result = await applyLawRulerRecovery(supabaseAdmin(), body.firm_id, selections, { id: me.id, name: "LawRuler recovery" });
    return reply(result, result.results.some(r => r.error) ? 207 : 200);
  } catch (error) { return reply({ error: error instanceof Error ? error.message : "Recovery failed." }, 500); }
}
