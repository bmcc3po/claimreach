import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";
export async function GET() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: u } = await sb.from("app_users").select("id, role, full_name, firm_id").eq("id", auth.user.id).maybeSingle();
  return NextResponse.json(u ?? { error: "no profile" });
}
