import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { gateUser } from "@/lib/gate";
import { isInternalRole } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import {
  MEDIA_LEASE_MS, mediaHostsFromEnv, resolveInboundMedia, supabaseMediaStore, type MediaLead,
} from "@/lib/inbound-media";
export const runtime = "edge";

// Texted-in pictures and documents that could not be filed on their own:
// the sender's number is on no file, or on several (quarantined), or the
// download failed. INTERNAL STAFF ONLY: a held attachment can name candidate
// files from several firms, so a firm login never reaches this route.
//
// GET  -> { items, can_resolve }         any active internal staff member
// POST { id, lead_id | lead_no }         owner, admin or manager: file it on
//                                        that lead (same safe download and
//                                        filing path as the webhook)

const RESOLVER_ROLES = new Set(["owner", "admin", "manager"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  const sb = await supabaseServer();
  const user = await gateUser(sb);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isInternalRole(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Read as the signed-in user: the table's own policy (is_internal) applies
  // on top of the role check above.
  const { data, error } = await sb.from("inbound_media")
    .select("id, provider, media_url, content_type, phone_norm, lead_id, status, attempts, last_error, candidates, created_at, updated_at")
    .in("status", ["quarantined", "failed", "pending"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const now = Date.now();
  // A pending row is only listed once its delivery has plainly stopped.
  const items = (data ?? []).filter((r: any) => r.status !== "pending" || now - Date.parse(r.updated_at) > MEDIA_LEASE_MS);
  return NextResponse.json({ items, can_resolve: RESOLVER_ROLES.has(user.role) });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const user = await gateUser(sb);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isInternalRole(user.role) || !RESOLVER_ROLES.has(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const id = String(b?.id ?? "");
  const leadId = String(b?.lead_id ?? "").trim();
  const leadNo = String(b?.lead_no ?? "").trim();
  if (!UUID.test(id)) return NextResponse.json({ error: "Pick an attachment." }, { status: 400 });
  if (!leadId && !leadNo) return NextResponse.json({ error: "Pick the file to put it on." }, { status: 400 });
  if (leadId && !UUID.test(leadId)) return NextResponse.json({ error: "That file link is not valid." }, { status: 400 });

  // The chosen lead is loaded as the signed-in user, so only a file they can
  // see can be chosen.
  const cols = "id, firm_id, lead_no, full_name, claimant_name, archived_at, firms(name)";
  const q = sb.from("leads").select(cols);
  const { data: found, error: leadErr } = leadId
    ? await q.eq("id", leadId).limit(2)
    : await q.eq("lead_no", leadNo).is("archived_at", null).limit(2);
  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
  if (!found?.length) return NextResponse.json({ error: "That file was not found." }, { status: 404 });
  if (found.length > 1) return NextResponse.json({ error: "More than one file has that number. Use the file's link instead." }, { status: 409 });
  const l: any = found[0];
  if (l.archived_at) return NextResponse.json({ error: "That file is archived." }, { status: 400 });
  if (!l.firm_id) return NextResponse.json({ error: "That file has no firm yet. Set its campaign first." }, { status: 400 });
  const firm = Array.isArray(l.firms) ? l.firms[0] : l.firms;
  const lead: MediaLead = {
    id: l.id, firm_id: l.firm_id, lead_no: l.lead_no ?? null,
    name: (l.claimant_name || l.full_name || "").trim() || null, firm: firm?.name ?? null, archived_at: null,
  };

  const out = await resolveInboundMedia({
    store: supabaseMediaStore(supabaseAdmin(), recordAudit),
    fetch: (u, init) => fetch(u, init),
    allowHosts: mediaHostsFromEnv(process.env.JUSTCALL_MEDIA_HOSTS),
  }, { id, lead, actor: { id: user.id, name: user.name } });

  if (out.ok) return NextResponse.json({ ok: true, status: out.status, document_id: out.document_id, warning: out.warning });
  const status = out.code === "not_found" ? 404
    : out.code === "already_saved" || out.code === "busy" || out.code === "rejected" ? 409
    : out.code === "failed" ? 502
    : out.code === "quarantined" ? 409
    : 500;
  return NextResponse.json({ ok: false, code: out.code, error: out.error }, { status });
}
