import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { resolveSigningMatter } from "@/lib/mva-call/signing-matter";
import { getSubmittersByExternalId, getSubmission } from "@/lib/docuseal";
import { finalizeSendAttempt, safeSendAttempt } from "@/lib/mva-call/send-attempt";
import { syncSubmission } from "@/lib/mva-call/esign";
import { recordAudit } from "@/lib/audit";
import { setClaimStatusForLeads } from "@/lib/claim-status";

export const runtime = "edge";

// Read the provider and adopt the exact already-created envelope. This route
// never creates an agreement, expires one, texts a link, or retries a send.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "owner") return NextResponse.json({ error: "Only the owner can reconcile an unconfirmed agreement send." }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body?.lead_id || !body?.attempt_id) return NextResponse.json({ error: "lead_id and attempt_id are required." }, { status: 400 });
  const context = await resolveSigningMatter(sb, String(body.lead_id), { claimId: body.claim_id });
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const admin = supabaseAdmin();
  let attempt: any;
  try {
    const result = await admin.rpc("cr_pending_esign_send", { p_claim_id: context.matter.claim.id, p_pax_key: body.pax_key || null });
    if (result.error) return NextResponse.json({ error: "Could not read the send reservation. It remains held." }, { status: 503 });
    attempt = result.data;
  } catch {
    return NextResponse.json({ error: "Could not read the send reservation. It remains held." }, { status: 503 });
  }
  const hold = safeSendAttempt(attempt);
  if (!hold || hold.id !== body.attempt_id) return NextResponse.json({ error: "This send reservation changed. Refresh the file before checking again." }, { status: 409 });
  const held = (error: string, status = 409) => NextResponse.json({ error, send_attempt: hold }, { status });
  if (!attempt.provider_started_at || !attempt.target_claim_id || !attempt.target_lead_id || !attempt.template_id) {
    return held("This send has no confirmed provider request to recover. It remains held for owner investigation.");
  }
  // A passenger lookup still authorizes the child's actual file through the
  // user's session before any trusted linking operation.
  const target = await resolveSigningMatter(sb, attempt.target_lead_id, { claimId: attempt.target_claim_id });
  if (!target.ok) return held("The signing file changed or is no longer accessible. The send remains held.");
  if (target.lead.firm_id !== attempt.firm_id || target.campaignId !== attempt.campaign_id) return held("The signing file changed. The send remains held.");
  const found = await getSubmittersByExternalId(attempt.id);
  if (!found.ok) return held("DocuSeal could not confirm this send. No new agreement was sent.", 502);
  const candidates: any[] = Array.isArray(found.data?.data) ? found.data.data : [];
  const count = (found.data?.pagination as any)?.count;
  if (candidates.length !== 1 || (count != null && Number(count) !== 1)) {
    return held("DocuSeal did not return one unique matching agreement. The send remains held; an empty search does not prove it failed.");
  }
  const match = candidates[0];
  if (match.external_id !== attempt.id || match.role !== "Client" || !match.id || !match.submission_id) return held("The provider result does not match this send. The send remains held.");
  const provider = await getSubmission(match.submission_id);
  if (!provider.ok) return held("DocuSeal could not verify the matching agreement. The send remains held.", 502);
  const envelope: any = provider.data;
  const signers: any[] = Array.isArray(envelope?.submitters) ? envelope.submitters : [];
  const clients = signers.filter(s => s.role === "Client");
  const offices = signers.filter(s => s.role === "Intake");
  const client = clients[0], office = offices[0];
  if (String(envelope?.id) !== String(match.submission_id) || String(envelope?.template?.id) !== String(attempt.template_id)
    || clients.length !== 1 || offices.length !== 1 || String(client?.id) !== String(match.id) || client?.external_id !== attempt.id || !office?.id) {
    return held("The provider agreement or template does not match this send. The send remains held.");
  }
  // GET submitter responses document slug rather than embed_src. Use the
  // known Cloud signing origin only for the standard Cloud API; custom hosts
  // must return their actual signing URL instead of guessing a host.
  const slug = client.slug || match.slug;
  const cloudApi = (process.env.DOCUSEAL_API_URL || "https://api.docuseal.com").replace(/\/+$/, "") === "https://api.docuseal.com";
  const signUrl = client.embed_src || match.embed_src || (cloudApi && typeof slug === "string" && /^[A-Za-z0-9_-]{4,200}$/.test(slug) ? `https://docuseal.com/s/${slug}` : null);
  // Only an HTTPS signing URL supplied by the verified provider response is
  // stored. It is never returned by this recovery action.
  try {
    const url = new URL(signUrl);
    if (url.protocol !== "https:" || url.username || url.password) return held("DocuSeal returned an invalid signing link. The send remains held.");
  } catch { return held("DocuSeal did not return a usable signing link. The send remains held."); }
  const saved = await finalizeSendAttempt(admin, attempt.id, {
    submission_id: String(envelope.id), client_submitter_id: String(client.id), intake_submitter_id: String(office.id), sign_url: signUrl,
  }, me.id);
  if (!saved.ok) return held("The matching agreement was found, but its local record could not be confirmed. Refresh before checking again.", saved.status);
  await recordAudit({ firm_id: attempt.firm_id, lead_id: attempt.target_lead_id, actor: me.id, actor_name: me.name ?? "Owner", category: "retainer",
    description: "Recovered the existing DocuSeal agreement after an unconfirmed send. No new agreement or signing link was sent.",
    meta: { attempt_id: attempt.id, esign_id: saved.id, submission_id: String(envelope.id), claim_id: attempt.target_claim_id } });
  // Catch up a signature/expiry that arrived before the local row existed.
  // A failed refresh leaves the adopted evidence available for normal polling.
  let status = "sent";
  let warning: string | undefined;
  try {
    const { data: row, error } = await admin.from("esign_submissions").select("*").eq("id", saved.id).maybeSingle();
    if (error || !row) warning = "The agreement was recovered. Refresh its status before taking the next step.";
    else status = await syncSubmission(admin, row, { origin: new URL(req.url).origin });
  } catch { warning = "The agreement was recovered. Refresh its status before taking the next step."; }
  if (["sent", "opened"].includes(status) && ["new", "contacting", "qualified", "esign_sent"].includes(String(target.matter.claim.status))) {
    const moved = await setClaimStatusForLeads({ leadIds: [attempt.target_lead_id], claimIds: [attempt.target_claim_id],
      status: "esign_sent", expectedStatus: target.matter.claim.status, historical: true, actorId: me.id, actorName: me.name ?? "Owner" });
    if (!moved.ok) warning = "The agreement was recovered, but the file status changed during recovery. Refresh the file to review its status.";
  }
  return NextResponse.json({ ok: true, recovered: true, agreement_id: saved.id, lead_id: attempt.target_lead_id, claim_id: attempt.target_claim_id, status,
    message: "Recovered the existing agreement. No new link was sent.", ...(warning ? { warning } : {}) });
}
