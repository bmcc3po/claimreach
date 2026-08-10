// ============================================================================
// OUTBOUND WEBHOOK DELIVERY
//
// Finds the endpoints subscribed to an event, maps our field names to the
// receiver's, HMAC-signs the payload, POSTs it, and logs the result. Edge-safe.
//
// This is a DIRECT call, not a queued job. /api/cron/automations exists and
// calls drainQueue(), but nothing is scheduled to hit it, so anything enqueued
// waits forever. Firing inline means a webhook either lands or shows up as
// failed in the event log, and both are visible the same day.
//
// Two things this does that the first version did not.
//
// FIELD MAPPING. An endpoint carries `field_map`, our_key -> their_key. Keys can
// be lead columns (claimant_name, phone) or intake answer ids (injured,
// treatment, case_subtype). A platform that asks the receiver to adapt to our
// field names is not integration-first; the whole point is that we adapt.
//
// CAMPAIGN SCOPE. Endpoints can bind to one campaign. A firm running MVA and
// trafficking asks entirely different questions, so one shape per firm was never
// going to be right.
// ============================================================================
import { supabaseAdmin } from "@/lib/supabase-server";
import { signPayload } from "@/lib/webhooks";

export interface FireOpts {
  /** Only endpoints bound to this campaign, plus firm-wide ones, receive it. */
  campaignId?: string | null;
  /** Intake answers, so a receiver can be sent individual question values. */
  answers?: Record<string, any> | null;
}

/**
 * Apply an endpoint's map. Unmapped keys are dropped when a map exists, because
 * a receiver that asked for six fields should get six fields, not our whole
 * record with six of them renamed. With no map, the payload passes through
 * unchanged, so an endpoint configured before mapping existed keeps working.
 */
export function applyFieldMap(flat: Record<string, any>, map: Record<string, string> | null | undefined) {
  if (!map || Object.keys(map).length === 0) return flat;
  const out: Record<string, any> = {};
  for (const [ourKey, theirKey] of Object.entries(map)) {
    if (!theirKey) continue;
    const v = flat[ourKey];
    if (v === undefined || v === null || v === "") continue;  // omit rather than send blanks
    out[String(theirKey)] = v;
  }
  return out;
}

export async function fireEvent(
  firmId: string | null,
  eventType: string,
  data: Record<string, any>,
  opts: FireOpts = {},
) {
  if (!firmId) return;
  const admin = supabaseAdmin();

  const { data: endpoints } = await admin.from("webhook_endpoints")
    .select("*").eq("firm_id", firmId).eq("active", true).contains("events", [eventType]);
  if (!endpoints || endpoints.length === 0) return;

  // A campaign-bound endpoint only hears about its own campaign. A firm-wide
  // endpoint (campaign_id null) hears about everything.
  const targets = endpoints.filter((ep: any) =>
    !ep.campaign_id || (opts.campaignId && ep.campaign_id === opts.campaignId));
  if (targets.length === 0) return;

  const answers = opts.answers ?? {};

  for (const ep of targets) {
    // Answers sit alongside lead fields in one flat bag so a map can name any of
    // them. Lead columns win a name collision: `phone` is the file's phone, not
    // a question that happens to be called phone.
    const flat: Record<string, any> = ep.include_answers === false
      ? { ...data }
      : { ...answers, ...data };

    const mapped = applyFieldMap(flat, ep.field_map);
    const hasMap = ep.field_map && Object.keys(ep.field_map).length > 0;

    // A mapped endpoint gets exactly the fields it asked for, at the top level,
    // because that is what a receiver's field map means. An unmapped endpoint
    // keeps the original envelope so nothing that works today changes.
    const bodyObj = hasMap
      ? { event: eventType, sent_at: new Date().toISOString(), ...mapped }
      : { event: eventType, sent_at: new Date().toISOString(), data: flat };
    const body = JSON.stringify(bodyObj);

    let status = "delivered", http = 0, errText: string | null = null, respText = "";
    try {
      const sig = await signPayload(ep.secret, body);
      const r = await fetch(ep.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CR-Event": eventType, "X-CR-Signature": sig },
        body,
      });
      http = r.status;
      respText = (await r.text()).slice(0, 300);
      if (!r.ok) { status = "failed"; errText = `http ${r.status}`; }
    } catch (e: any) { status = "failed"; errText = String(e?.message ?? e); }

    try {
      await admin.from("webhook_events").insert({
        firm_id: firmId, direction: "outbound", event_type: eventType,
        endpoint: ep.url, status, http_status: http,
        payload: bodyObj, response: respText, error: errText,
      });
    } catch {}
  }
}
