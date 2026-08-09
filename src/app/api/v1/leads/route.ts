import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { lookupKey } from "@/lib/webhooks";
export const runtime = "edge";

// Public REST read API. Auth: header X-CR-Key: <key_id>.
// Firm key -> only that firm's leads. Master key -> ?firm_id= to scope.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const keyId = req.headers.get("x-cr-key");
  if (!keyId) return NextResponse.json({ error: "missing X-CR-Key" }, { status: 401 });
  const key = await lookupKey(keyId);
  if (!key) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  const admin = supabaseAdmin();
  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);

  let firmId = key.firm_id;
  if (key.scope === "master") firmId = url.searchParams.get("firm_id") || null;
  if (!firmId) return NextResponse.json({ error: "firm_id required for master key" }, { status: 400 });

  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);

  let q = admin.from("leads")
    .select("id, lead_no, first_name, last_name, full_name, phone, email, case_type, campaign, status, external_id, created_at")
    .eq("firm_id", firmId).order("created_at", { ascending: false }).limit(limit);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leads: data ?? [], count: data?.length ?? 0 });
}
