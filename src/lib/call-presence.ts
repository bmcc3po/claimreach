import { normPhone } from "@/lib/comms";

/** JustCall retries and reorders these events. Only explicit lifecycle events
 * change live occupancy; call.updated and AI enrichment do not. */
export function presenceEvent(type: string): "ringing" | "connected" | "ended" | null {
  switch (String(type || "").toLowerCase()) {
    case "call.incoming":
    case "call.outgoing":
    case "sd.call_initiated": return "ringing";
    case "call.answered":
    case "sd.call_answered": return "connected";
    case "call.completed":
    case "call.missed":
    case "call.voicemail":
    case "sd.call_completed": return "ended";
    default: return null;
  }
}

export async function recordProviderPresence(admin: any, type: string, data: any): Promise<void> {
  const state = presenceEvent(type);
  if (!state) return;
  const phone = normPhone(data?.contact_number);
  const sid = String(data?.call_sid || data?.call_id || data?.id || "");
  if (phone.length !== 10 || sid.length < 2) {
    // Early events can be partial. A terminal without an identity must retry;
    // an early event cannot be safely attributed to a client yet.
    if (state === "ended") throw new Error("Call presence identity missing");
    return;
  }
  const { error } = await admin.rpc("cr_record_call_presence", {
    p_sid: sid, p_phone: phone, p_state: state,
    p_agent_name: String(data?.agent_name || "").slice(0, 120),
    p_agent_email: String(data?.agent_email || "").slice(0, 254),
  });
  if (error) throw new Error(`Call presence not saved: ${error.message}`);
}
