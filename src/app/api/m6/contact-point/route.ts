import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { m6WriteAccess } from "@/lib/m6";
import { loadM6Lead, requireM6Session } from "@/lib/m6-scope";
export const runtime = "edge";

const KINDS = ["mobile", "landline", "email", "social", "address", "person"];

// Append only. Marking a number dead retires it in place rather than deleting
// it, because a dead number from last year is where a skip trace starts.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const tmpFirmId = session.tmpFirmId;
  const actor = session.actor;

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const {
    lead_id, id, status, kind, value, label, person_name, relationship,
    platform, permission_to_discuss, contact_script,
  } = b ?? {};

  async function gateLead(targetId: string) {
    const lead = await loadM6Lead(sb, targetId, tmpFirmId, "id, firm_id, campaign, case_type, archived_at");
    const verdict = m6WriteAccess(actor, lead, tmpFirmId);
    if (verdict === "forbidden") return { ok: false as const, status: 403 as const, error: "This app is for TMP Motel 6 files only." };
    if (verdict !== "ok" || !lead) return { ok: false as const, status: 404 as const, error: "That file is not available to you." };
    return { ok: true as const, lead };
  }

  // Updating an existing point, usually marking it dead. Scope the lookup to
  // TMP so a guessed UUID cannot touch another firm's web.
  if (id) {
    const { data: point } = await sb.from("contact_points")
      .select("id, lead_id").eq("id", id).eq("firm_id", tmpFirmId).maybeSingle();
    if (!point?.lead_id) {
      return NextResponse.json({ error: "That file is not available to you." }, { status: 404 });
    }
    const gate = await gateLead(point.lead_id);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const patch: any = {};
    if (status === "dead" || status === "opted_out" || status === "good" || status === "shaky") {
      patch.status = status;
    }
    if (label !== undefined) patch.label = label;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }
    const { error } = await sb.from("contact_points").update(patch).eq("id", id).eq("firm_id", tmpFirmId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!lead_id) return NextResponse.json({ error: "Missing the file." }, { status: 400 });
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: `Kind must be one of: ${KINDS.join(", ")}` }, { status: 400 });
  }
  if (!String(value ?? "").trim()) {
    return NextResponse.json({ error: "Add the number, email, or handle." }, { status: 400 });
  }

  const gate = await gateLead(lead_id);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { error } = await sb.from("contact_points").upsert({
    firm_id: gate.lead.firm_id, lead_id, kind,
    value: String(value).trim(),
    label: label || null,
    person_name: person_name || null,
    relationship: relationship || null,
    platform: platform || null,
    permission_to_discuss: typeof permission_to_discuss === "boolean" ? permission_to_discuss : null,
    contact_script: contact_script || null,
    is_primary: false,
    status: "good",
    source_system: "manual",
    created_by: session.user.id,
  }, { onConflict: "lead_id,kind,value" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
