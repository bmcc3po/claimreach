import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { emergencyView, finishEmergencyPacket } from "@/lib/emergency-signing";
export const runtime = "edge";

export async function GET(req: NextRequest) {
  const group = new URL(req.url).searchParams.get("group");
  if (!group) return NextResponse.json({ error: "missing group" }, { status: 400 });
  const db = supabaseAdmin();
  const result = await db.from("signable_documents").select("*").eq("packet_group", group).order("packet_seq");
  if (result.error || !result.data?.length) return NextResponse.json({ error: "Signing packet not found." }, { status: 404 });
  if (result.data.some((d: any) => ["cancelled", "declined"].includes(d.status))) return NextResponse.json({ error: "This signing link is no longer open." }, { status: 409 });
  try { return NextResponse.json({ group, docs: await Promise.all(result.data.map((d: any) => emergencyView(db, d))), signer_name: result.data[0].signer_name }); }
  catch (error: any) { return NextResponse.json({ error: error.message }, { status: 409 }); }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  if (!b?.group) return NextResponse.json({ error: "missing group" }, { status: 400 });
  const db = supabaseAdmin();
  const result = await db.from("signable_documents").select("*").eq("packet_group", b.group).order("packet_seq");
  if (result.error || !result.data?.length) return NextResponse.json({ error: "Signing packet not found." }, { status: 404 });
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  if (b.op === "viewed") {
    const { error } = await db.from("signable_documents").update({ status: "viewed", viewed_at: new Date().toISOString(), viewed_ip: ip }).eq("packet_group", b.group).eq("status", "sent");
    return NextResponse.json(error ? { error: "Could not record the view." } : { ok: true }, { status: error ? 503 : 200 });
  }
  try { return NextResponse.json(await finishEmergencyPacket(db, result.data, b, { ip, ua: req.headers.get("user-agent") || "" })); }
  catch (error: any) { return NextResponse.json({ error: error.message }, { status: 409 }); }
}
