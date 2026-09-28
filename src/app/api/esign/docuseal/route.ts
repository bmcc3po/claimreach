import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { webhookAuthorized } from "@/lib/docuseal";
import { syncSubmission } from "@/lib/mva-call/esign";

export const runtime = "edge";

// POST /api/esign/docuseal
// DocuSeal webhook (form.viewed, form.completed, form.declined,
// submission.completed). The secret is DOCUSEAL_WEBHOOK_SECRET, sent either as
// a header named X-CR-Secret or on the URL as ?key=<secret> (DocuSeal's
// console has no header box). Fails closed: no secret configured or a wrong
// one means 401, nothing moves.
// The payload is only a nudge. We re-read the agreement from DocuSeal's API
// before changing anything, so a forged body cannot sign a file.
export async function POST(req: NextRequest) {
  const admin = supabaseAdmin();
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET;
  const given = req.headers.get("x-cr-secret") || new URL(req.url).searchParams.get("key");
  if (!webhookAuthorized(given, secret)) {
    try { await admin.from("webhook_events").insert({ direction: "inbound", event_type: "docuseal.rejected", status: "failed", http_status: 401, error: secret ? "bad or missing secret" : "DOCUSEAL_WEBHOOK_SECRET is not set in Cloudflare" }); } catch {}
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const p = await req.json().catch(() => null);
  const type = String(p?.event_type || "unknown");
  const d = p?.data || {};
  const submissionId = String(d.submission_id ?? d.submission?.id ?? (type.startsWith("submission.") ? d.id : "") ?? "");
  try { await admin.from("webhook_events").insert({ direction: "inbound", event_type: "docuseal." + type, status: "received", payload: { event_type: type, submission_id: submissionId } }); } catch {}
  if (!submissionId) return NextResponse.json({ ok: true, ignored: "no submission id" });

  const { data: row } = await admin.from("esign_submissions").select("*").eq("provider", "docuseal").eq("submission_id", submissionId).maybeSingle();
  if (!row) return NextResponse.json({ ok: true, ignored: "not ours" });
  const status = await syncSubmission(admin, row, { origin: new URL(req.url).origin });
  return NextResponse.json({ ok: true, status });
}
