import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

export async function GET() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await sb.from("retainer_templates").select("id, name, case_type, is_default").order("name");
  return NextResponse.json({ templates: data ?? [] });
}
