import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

export async function GET(req: Request) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const { data } = await sb.from("retainer_templates").select("id, name, body, case_type, is_default").eq("id", id).maybeSingle();
    return NextResponse.json({ template: data ?? null });
  }
  const { data } = await sb.from("retainer_templates").select("id, name, case_type, is_default").order("name");
  return NextResponse.json({ templates: data ?? [] });
}
