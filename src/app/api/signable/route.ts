import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveSigningMatter } from "@/lib/mva-call/signing-matter";
export const runtime = "edge";

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const context = await resolveSigningMatter(sb, url.searchParams.get("lead_id") || "", { claimId: url.searchParams.get("claim_id"), allowArchived: true });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const { data, error } = await sb.from("signable_documents").select("*").eq("lead_id", context.lead.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  const docs = (data ?? []).filter((d: any) => (d.audit?.emergency?.claim_id || d.claim_id) === context.matter.claim.id);
  const legacy = (data ?? []).filter((d: any) => !d.audit?.emergency?.claim_id && !d.claim_id);
  return NextResponse.json({ docs, legacy_docs: legacy, claim_id: context.matter.claim.id });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (b?.op === "create") return NextResponse.json({ error: "Issue DocuSeal or an explicit emergency packet from this matter's Agreement tab." }, { status: 409 });
  if (b?.op === "delete") return NextResponse.json({ error: "Signing history is preserved. Cancel a pending agreement or void its primary DocuSeal agreement." }, { status: 409 });
  if (b?.op !== "cancel") return NextResponse.json({ error: "unknown op" }, { status: 400 });
  if (!["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "Only an owner or admin can cancel a pending agreement." }, { status: 403 });
  const named = await sb.from("signable_documents").select("*").eq("id", b.id).maybeSingle();
  if (named.error || !named.data) return NextResponse.json({ error: "Agreement not found." }, { status: 404 });
  const doc = named.data;
  const claimId = doc.audit?.emergency?.claim_id || doc.claim_id;
  const context = await resolveSigningMatter(sb, doc.lead_id, { claimId: b.claim_id || claimId });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!claimId || claimId !== context.matter.claim.id) return NextResponse.json({ error: "This older agreement needs an explicit matter association before it can be changed." }, { status: 409 });
  if (!["sent", "viewed", "draft", "cancelled"].includes(doc.status)) return NextResponse.json({ error: "Signing has already begun. Its signature evidence must be preserved." }, { status: 409 });
  let q = sb.from("signable_documents").update({ status: "cancelled" }).in("status", ["sent", "viewed", "draft"]);
  q = doc.packet_group ? q.eq("packet_group", doc.packet_group) : q.eq("id", doc.id);
  const result = await q.select("id");
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 409 });
  return NextResponse.json({ ok: true });
}
