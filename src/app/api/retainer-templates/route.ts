import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

export async function GET(req: Request) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const { data } = await sb.from("retainer_templates").select("id, name, body, case_type, is_default").eq("id", id).maybeSingle();
    return NextResponse.json({ template: data ?? null });
  }
  // Unified: every retainer SOURCE (text templates + uploaded PDFs) as one list,
  // each tagged by kind so a campaign packet or picker can use either.
  if (url.searchParams.get("all") === "1") {
    const { data: text } = await sb.from("retainer_templates").select("id, name, case_type, is_default, campaign_id").order("name");
    const { data: pdf } = await sb.from("pdf_templates").select("id, name, case_type, is_default, campaign_id").order("name");
    const sources = [
      ...(text ?? []).map((t) => ({ ...t, kind: "text" as const })),
      ...(pdf ?? []).map((t) => ({ ...t, kind: "pdf" as const })),
    ];
    return NextResponse.json({ sources });
  }
  const { data } = await sb.from("retainer_templates").select("id, name, case_type, is_default").order("name");
  return NextResponse.json({ templates: data ?? [] });
}
