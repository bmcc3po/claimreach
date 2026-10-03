import { NextRequest, NextResponse } from "next/server";
import { netflyContext, netflyMatter } from "@/lib/netfly-server";
import { NETFLY_RETAINER_TYPE } from "@/lib/netfly-ontake";
import { netflyDocumentKey } from "@/lib/netfly-documents";
export const runtime = "edge";

// Resolve on click, rather than giving the agent a link that expires mid-call.
export async function GET(req: NextRequest) {
  const ctx = await netflyContext();
  if (!ctx?.actor.can("leads.view")) return NextResponse.json({ error: "NETFLY document access is unavailable." }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const matter = await netflyMatter(ctx, params.get("file") || "");
  if (!matter) return NextResponse.json({ error: "NETFLY matter not found." }, { status: 404 });
  const { data: doc, error } = await ctx.db.from("case_documents").select("storage_path")
    .eq("id", params.get("document") || "").eq("firm_id", ctx.campaign.firm_id)
    .eq("lead_id", matter.lead.id).eq("claim_id", matter.claim.id).eq("doc_type", NETFLY_RETAINER_TYPE).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not open the PDF. Please retry." }, { status: 503 });
  const key = netflyDocumentKey(doc?.storage_path, ctx.campaign.firm_id, matter.lead.id);
  if (!key) return NextResponse.json({ error: "Signed PDF not found on this file." }, { status: 404 });
  const signed = await ctx.db.storage.from("case-docs").createSignedUrl(key, 300);
  if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ error: "Could not open the PDF. Please retry." }, { status: 503 });
  const response = NextResponse.redirect(signed.data.signedUrl, 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(req: NextRequest) {
  const ctx = await netflyContext();
  if (!ctx || !ctx.actor.can("docs.upload")) return NextResponse.json({ error: "NETFLY document access is unavailable." }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Could not read the upload." }, { status: 400 }); }
  const matter = await netflyMatter(ctx, String(form.get("file_key") || ""));
  if (!matter) return NextResponse.json({ error: "NETFLY matter not found." }, { status: 404 });
  const file = form.get("file");
  if (!(file instanceof File) || file.size < 100 || file.size > 15 * 1024 * 1024 || !/\.pdf$/i.test(file.name))
    return NextResponse.json({ error: "Choose a PDF retainer under 15 MB." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder().decode(bytes.slice(0, 8));
  const tail = new TextDecoder().decode(bytes.slice(-2048));
  if (!header.startsWith("%PDF-") || !tail.includes("%%EOF"))
    return NextResponse.json({ error: "This file is not a complete PDF." }, { status: 400 });
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
  const safeName = file.name.split(/[\\/]/).pop()?.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || "signed-retainer.pdf";
  const path = `${ctx.campaign.firm_id}/${matter.lead.id}/netfly-${matter.claim.id}-${crypto.randomUUID()}.pdf`;
  const stored = await ctx.db.storage.from("case-docs").upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (stored.error) return NextResponse.json({ error: "The PDF could not be stored. Try again." }, { status: 503 });
  const inserted = await ctx.db.from("case_documents").insert({
    firm_id: ctx.campaign.firm_id, lead_id: matter.lead.id, claim_id: matter.claim.id,
    doc_type: NETFLY_RETAINER_TYPE, file_name: safeName, storage_path: path,
    uploaded_by: ctx.actor.id, uploaded_by_name: ctx.actor.name || "Staff",
  }).select("id").single();
  if (inserted.error || !inserted.data) {
    await ctx.db.storage.from("case-docs").remove([path]);
    return NextResponse.json({ error: "The document record could not be saved; no retainer was accepted." }, { status: 503 });
  }
  const audit = await ctx.db.from("audit_log").insert({
    firm_id: ctx.campaign.firm_id, lead_id: matter.lead.id, claim_id: matter.claim.id,
    actor: ctx.actor.id, actor_name: ctx.actor.name, category: "retainer",
    description: "NETFLY signed retainer received — review required",
    meta: { document_id: inserted.data.id, sha256, bytes: bytes.length, source: "NETFLY secondary intake" },
  });
  if (audit.error) return NextResponse.json({ error: "PDF saved, but its audit event failed. Open the file and contact a supervisor before continuing.", document_id: inserted.data.id }, { status: 503 });
  return NextResponse.json({ ok: true, document_id: inserted.data.id, sha256 });
}
