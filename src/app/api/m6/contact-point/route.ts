import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

const KINDS = ["mobile", "landline", "email", "social", "address", "person"];

// Append only. Marking a number dead retires it in place rather than deleting
// it, because a dead number from last year is where a skip trace starts.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again to save this." }, { status: 401 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const { lead_id, id, status, kind, value, label, person_name, relationship } = b ?? {};

  // Updating an existing point, usually marking it dead.
  if (id) {
    const patch: any = {};
    if (status) patch.status = status;
    if (label !== undefined) patch.label = label;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }
    const { error } = await sb.from("contact_points").update(patch).eq("id", id);
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

  const { data: lead } = await sb.from("leads").select("id, firm_id").eq("id", lead_id).maybeSingle();
  if (!lead) return NextResponse.json({ error: "That file is not available to you." }, { status: 404 });

  const { error } = await sb.from("contact_points").upsert({
    firm_id: lead.firm_id, lead_id, kind,
    value: String(value).trim(),
    label: label || null,
    person_name: person_name || null,
    relationship: relationship || null,
    is_primary: false,
    status: "good",
    source_system: "manual",
    created_by: user.id,
  }, { onConflict: "lead_id,kind,value" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
