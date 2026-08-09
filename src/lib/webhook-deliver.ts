// Outbound webhook delivery. Finds firm endpoints subscribed to an event,
// HMAC-signs the payload, POSTs it, logs the result. Edge-safe.
import { supabaseAdmin } from "@/lib/supabase-server";
import { signPayload } from "@/lib/webhooks";

export async function fireEvent(firmId: string | null, eventType: string, data: Record<string, any>) {
  if (!firmId) return;
  const admin = supabaseAdmin();
  const { data: endpoints } = await admin.from("webhook_endpoints")
    .select("*").eq("firm_id", firmId).eq("active", true).contains("events", [eventType]);
  if (!endpoints || endpoints.length === 0) return;

  const bodyObj = { event: eventType, sent_at: new Date().toISOString(), data };
  const body = JSON.stringify(bodyObj);

  for (const ep of endpoints) {
    let status = "delivered", http = 0, errText: string | null = null, respText = "";
    try {
      const sig = await signPayload(ep.secret, body);
      const r = await fetch(ep.url, { method: "POST", headers: { "Content-Type": "application/json", "X-CR-Event": eventType, "X-CR-Signature": sig }, body });
      http = r.status;
      respText = (await r.text()).slice(0, 300);
      if (!r.ok) { status = "failed"; errText = `http ${r.status}`; }
    } catch (e: any) { status = "failed"; errText = String(e?.message ?? e); }
    try {
      await admin.from("webhook_events").insert({ firm_id: firmId, direction: "outbound", event_type: eventType, endpoint: ep.url, status, http_status: http, payload: bodyObj, response: respText, error: errText });
    } catch {}
  }
}
