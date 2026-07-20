import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";
export async function GET() {
  const sb = await supabaseServer();
  const { data } = await sb.from("option_lists").select("list_key, value, sort_order").order("sort_order");
  const options: Record<string, string[]> = {};
  for (const r of data ?? []) (options[r.list_key] ||= []).push(r.value);
  return NextResponse.json({ options });
}
