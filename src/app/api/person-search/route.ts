import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

// GET ?q=... — find existing people by name or phone, with their claims.
// This is the serial-filer / duplicate catch: look up the PERSON first.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const digits = q.replace(/\D/g, "");
  // Match name OR phone (if the query looks like a number).
  let query = sb.from("leads")
    .select("id, lead_no, claimant_name, phone, email, created_at, claims(id, campaign, claim_type, status)")
    .limit(10);

  if (digits.length >= 4) {
    query = query.ilike("phone", `%${digits}%`);
  } else {
    query = query.ilike("claimant_name", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data ?? [] });
}
