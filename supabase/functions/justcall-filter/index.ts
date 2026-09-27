// JustCall webhook filter for ClaimReach (Supabase Edge Function).
//
// JustCall posts every call, text, voicemail and AI report on the whole
// account, most of it sales dialer traffic for other campaigns. ClaimReach only
// needs what belongs to its files. JustCall now posts here instead, and this
// keeps an event only when:
//   the other party's number matches a ClaimReach lead (leads.phone_norm), or
//   it is a text on a ClaimReach texting line, so a new person texting in
//   still reaches the unmatched inbox.
// Everything else stops here and never touches ClaimReach. Kept events go to
// ClaimReach's own webhook unchanged, with the key, so the filing logic lives
// in one place (src/lib/comms.ts).
//
// The key: JustCall's URL carries ?key=<JUSTCALL_WEBHOOK_SECRET>. Only its
// SHA-256 is stored here. ClaimReach checks the key itself as well.
// Deployed with verify_jwt off because JustCall cannot send a Supabase token;
// the key check below is the gate.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const KEY_SHA256 = "708196b1548f72f4c0f081353220408094c5c8c93dc1d54ca3b6f7ef83dae600";
const TARGET = "https://claimreach.com/api/justcall/webhook";
// The ClaimReach texting line (JUSTCALL_DEFAULT_FROM, "4tmplaw"). Sending
// numbers in retention_settings are added on top at run time.
const TEXT_LINES = ["4844867529"];

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const ten = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

let lines: Set<string> | null = null;
let linesAt = 0;
async function textLines(): Promise<Set<string>> {
  if (lines && Date.now() - linesAt < 5 * 60_000) return lines;
  const set = new Set(TEXT_LINES);
  try {
    const { data } = await sb.from("retention_settings").select("sending_number");
    for (const r of data ?? []) { const t = ten((r as any).sending_number); if (t.length === 10) set.add(t); }
  } catch { /* the fixed line still counts */ }
  lines = set;
  linesAt = Date.now();
  return set;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: true, service: "justcall-filter" });

  const url = new URL(req.url);
  const key = url.searchParams.get("key") || req.headers.get("x-justcall-secret") || "";
  if (!key || (await sha256hex(key)) !== KEY_SHA256) return json({ error: "unauthorized" }, 401);

  const raw = await req.text();
  let p: any;
  try { p = JSON.parse(raw); } catch { return json({ error: "invalid json" }, 400); }

  const type = String(p?.type || "").toLowerCase();
  const d = p?.data || {};
  const phone = ten(d.contact_number);
  const line = ten(d.justcall_number || d.sales_dialer_number);
  const isText = type.startsWith("sms") || type.includes("message") || !!d.sms_info;

  let keep = false;
  let why = "";
  if (phone.length === 10) {
    const { data, error } = await sb.from("leads").select("id").eq("phone_norm", phone).limit(1);
    // If the lookup itself fails, pass it on rather than lose something of ours.
    if (error) { keep = true; why = "lookup failed"; }
    else if (data && data.length) { keep = true; why = "lead"; }
  }
  if (!keep && isText && line.length === 10 && (await textLines()).has(line)) { keep = true; why = "texting line"; }

  if (!keep) return json({ ok: true, kept: false });

  const r = await fetch(TARGET, {
    method: "POST",
    headers: { "content-type": "application/json", "x-justcall-secret": key },
    body: raw,
  });
  const out = await r.text();
  console.log(JSON.stringify({ kept: type, why, status: r.status }));
  return new Response(out, { status: r.status, headers: { "content-type": "application/json" } });
});
