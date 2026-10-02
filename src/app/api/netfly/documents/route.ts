import { NextRequest, NextResponse } from "next/server";
import { netflyContext, netflyMatter } from "@/lib/netfly-server";
import { INBOUND_DOCUMENT_TYPES, NETFLY_DOCUMENT_KEYS, netflyDocumentKey, netflyPhotoRequest } from "@/lib/netfly-documents";
import { normPhone } from "@/lib/comms";
import { supabaseMediaStore } from "@/lib/inbound-media";
import { recordAudit } from "@/lib/audit";
import { sendJustCallSms, toE164 } from "@/lib/justcall-send";
import { isSmsRevocation } from "@/lib/sms-opt-out";

export const runtime = "edge";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  const ctx = await netflyContext();
  if (!ctx?.actor.can("leads.view")) return fail("NETFLY is unavailable to this account.", 403);
  const matter = await netflyMatter(ctx, new URL(req.url).searchParams.get("file") || "");
  if (!matter) return fail("NETFLY file not found.", 404);
  const { data, error } = await ctx.db.from("case_documents")
    .select("id, lead_id, firm_id, claim_id, file_name, doc_type, storage_path, created_at")
    .eq("firm_id", ctx.campaign.firm_id).eq("lead_id", matter.lead.id)
    .or(`claim_id.eq.${matter.claim.id},claim_id.is.null`)
    .order("created_at", { ascending: false }).limit(100);
  if (error) return fail("Could not load the client pictures. Refresh and retry.", 503);
  const selected = (data || []).filter((doc: any) => NETFLY_DOCUMENT_KEYS.has(doc.doc_type) || INBOUND_DOCUMENT_TYPES.has(doc.doc_type));
  const docs = await Promise.all(selected.map(async (doc: any) => {
    const key = netflyDocumentKey(doc.storage_path, ctx.campaign.firm_id, matter.lead.id);
    const signed = key ? await ctx.db.storage.from("case-docs").createSignedUrl(key, 300) : null;
    return { id: doc.id, file_name: doc.file_name, doc_type: doc.doc_type, created_at: doc.created_at, url: signed?.data?.signedUrl || null };
  }));
  const request = await ctx.db.from("communications").select("send_status, occurred_at")
    .eq("firm_id", ctx.campaign.firm_id).eq("lead_id", matter.lead.id).eq("purpose", "netfly_documents_request")
    .order("occurred_at", { ascending: false }).limit(1).maybeSingle();
  if (request.error) return fail("Could not verify the photo-request history. Refresh and retry.", 503);
  return NextResponse.json({ docs, phone: matter.lead.phone || "", request_text: netflyPhotoRequest(matter.lead.claimant_name || ""),
    last_request: request.data || null });
}

export async function PATCH(req: NextRequest) {
  const ctx = await netflyContext();
  if (!ctx?.actor.can("intake.fill")) return fail("This account cannot label client documents.", 403);
  const body = await req.json().catch(() => null);
  const matter = await netflyMatter(ctx, String(body?.file || ""));
  if (!matter) return fail("NETFLY file not found.", 404);
  const kind = String(body?.kind || "");
  const id = String(body?.document_id || "");
  if (!NETFLY_DOCUMENT_KEYS.has(kind) || !/^[0-9a-f-]{36}$/i.test(id)) return fail("Choose a picture and a document type.", 400);
  const { data: doc, error: readError } = await ctx.db.from("case_documents")
    .select("id, doc_type, claim_id, storage_path")
    .eq("id", id).eq("firm_id", ctx.campaign.firm_id).eq("lead_id", matter.lead.id).maybeSingle();
  if (readError || !doc || (doc.claim_id && doc.claim_id !== matter.claim.id)) return fail("Document not found on this matter.", 404);
  if (!INBOUND_DOCUMENT_TYPES.has(doc.doc_type) && !NETFLY_DOCUMENT_KEYS.has(doc.doc_type)) return fail("This document cannot be relabeled here.", 409);
  if (!netflyDocumentKey(doc.storage_path, ctx.campaign.firm_id, matter.lead.id)) return fail("Document storage path needs supervisor review.", 409);
  if (doc.doc_type === kind && doc.claim_id === matter.claim.id) return NextResponse.json({ ok: true, unchanged: true });
  const { data: updated, error } = await ctx.db.from("case_documents")
    .update({ doc_type: kind, claim_id: matter.claim.id })
    .eq("id", id).eq("firm_id", ctx.campaign.firm_id).eq("lead_id", matter.lead.id)
    .eq("doc_type", doc.doc_type).select("id").maybeSingle();
  if (error || !updated) return fail("The document changed. Refresh and retry.", 409);
  await recordAudit({ firm_id: ctx.campaign.firm_id, lead_id: matter.lead.id, claim_id: matter.claim.id,
    actor: ctx.actor.id, actor_name: ctx.actor.name || "Agent", category: "docs",
    description: "Labeled a client-sent NETFLY document.", meta: { document_id: id, from: doc.doc_type, to: kind } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const ctx = await netflyContext();
  if (!ctx?.actor.can("intake.fill")) return fail("This account cannot request client pictures.", 403);
  const body = await req.json().catch(() => null);
  if (body?.op !== "request_photos" || body?.client_agreed_to_text !== true) return fail("Confirm that the client agreed to receive this text.", 400);
  const matter = await netflyMatter(ctx, String(body.file || ""));
  if (!matter) return fail("NETFLY file not found.", 404);
  const to = toE164(matter.lead.phone);
  const phoneNorm = normPhone(matter.lead.phone);
  if (!to || phoneNorm.length !== 10) return fail("Add and verify the client's mobile number before requesting pictures.", 409);
  const match = await supabaseMediaStore(ctx.db, recordAudit).leadsForPhone(phoneNorm);
  if (match.error) return fail("Could not verify where replies will be filed. Text held.", 503);
  if (match.leads.length !== 1 || match.leads[0].id !== matter.lead.id)
    return fail("This number is on another file or is not indexed yet. Text held so photos cannot land on the wrong file.", 409);
  const { data: points, error: pointError } = await ctx.db.from("contact_points").select("value, status")
    .in("kind", ["mobile", "landline"]).is("retired_at", null)
    .ilike("value", `%${phoneNorm.slice(0, 3)}%${phoneNorm.slice(3, 6)}%${phoneNorm.slice(6)}%`).limit(1000);
  if (pointError || (points || []).length === 1000) return fail("Could not fully verify text opt-out. Text held.", 503);
  if ((points || []).some((point: any) => point.status === "opted_out" && normPhone(point.value) === phoneNorm))
    return fail("This number opted out. Do not text it.", 409);
  const { data: inbound, error: commError } = await ctx.db.from("communications")
    .select("body").eq("phone_norm", phoneNorm).eq("channel", "sms").eq("direction", "inbound")
    .order("occurred_at", { ascending: false }).limit(1000);
  if (commError || (inbound || []).length === 1000) return fail("Could not fully check text opt-outs. Text held.", 503);
  if ((inbound || []).some((row: any) => isSmsRevocation(row.body || ""))) return fail("This number has texted an opt-out. Do not text it.", 409);
  const from = process.env.JUSTCALL_DEFAULT_FROM || "";
  if (!from) return fail("No JustCall sending number is configured. Text held.", 503);
  const sms = netflyPhotoRequest(matter.lead.claimant_name || "");
  const recent = await ctx.db.from("communications").select("id, send_status")
    .eq("lead_id", matter.lead.id).eq("purpose", "netfly_documents_request")
    .order("occurred_at", { ascending: false }).limit(1);
  if (recent.error) return fail("Could not check recent requests. Text held.", 503);
  if (recent.data?.[0] && recent.data[0].send_status !== "failed")
    return fail("A photo request was already sent or is unresolved. Review the text history before another request.", 409);
  const now = new Date().toISOString();
  const { data: attempt, error: insertError } = await ctx.db.from("communications").insert({
    lead_id: matter.lead.id, firm_id: ctx.campaign.firm_id, channel: "sms", direction: "outbound",
    phone_raw: matter.lead.phone, phone_norm: phoneNorm, agent_name: ctx.actor.name || "Agent", body: sms,
    provider: "justcall", purpose: "netfly_documents_request", send_status: "pending", occurred_at: now,
  }).select("id").single();
  if (insertError || !attempt) return fail("Could not record the text request. Nothing was sent.", 503);
  const sent = await sendJustCallSms({ to, from, body: sms });
  if (!sent.ok) {
    await ctx.db.from("communications").update({ send_status: "failed" }).eq("id", attempt.id);
    return fail(`Photo request was not sent: ${sent.error}`, 502);
  }
  const provider: any = sent.data || {};
  const sid = String(provider?.data?.[0]?.id ?? provider?.data?.id ?? provider?.id ?? "") || null;
  const saved = await ctx.db.from("communications").update({ send_status: "sent", sms_sid: sid }).eq("id", attempt.id);
  if (saved.error) return fail("The provider accepted the text, but its delivery record could not be updated. Do not resend; ask a supervisor to reconcile it.", 503);
  await recordAudit({ firm_id: ctx.campaign.firm_id, lead_id: matter.lead.id, claim_id: matter.claim.id,
    actor: ctx.actor.id, actor_name: ctx.actor.name || "Agent", category: "sms",
    description: "Requested case-manager photos by text with the client's confirmed permission.",
    meta: { communication_id: attempt.id, to, provider_id: sid } });
  return NextResponse.json({ ok: true, communication_id: attempt.id });
}
