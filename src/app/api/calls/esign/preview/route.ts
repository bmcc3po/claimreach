import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { stateCodeOf } from "@/lib/mva-call/state";
import { packetsFor } from "@/lib/mva-call/esign";
import { agreementKey } from "@/lib/docuseal";
import { stampPreview } from "@/lib/mva-call/preview";

export const runtime = "edge";

// GET /api/calls/esign/preview?lead_id=&signer=&injured=&city=&today=
// The exact agreement she will get, with what the call filled in stamped where
// DocuSeal puts it, so the agent can check it before it goes out. Marked
// PREVIEW on every page. Nothing is sent and nothing is saved.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (k: string) => String(url.searchParams.get(k) || "").trim().slice(0, 120);
  const leadId = q("lead_id");
  const signer = q("signer");
  const injured = q("injured") || signer;
  const today = /^\d{2}\/\d{2}\/\d{4}$/.test(q("today")) ? q("today") : "";

  const { data: lead } = await sb.from("leads").select("id, firm_id, case_type, firms(slug)").eq("id", leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  const packets = packetsFor((lead as any).firms?.slug, lead.case_type);
  if (!packets) return NextResponse.json({ error: "This campaign has no agreement set up to preview." }, { status: 404 });
  const key = agreementKey(stateCodeOf(q("city")));
  if (!key) return NextResponse.json({ error: "Add the city and state on Story first. That picks the agreement." }, { status: 400 });
  const packet = (packets as any)[key];

  const src = await fetch(new URL(packet.path, url.origin));
  if (!src.ok) return NextResponse.json({ error: `Could not load the agreement file (${src.status}).` }, { status: 502 });
  const out = await stampPreview(new Uint8Array(await src.arrayBuffer()), packet, key, { signer, injured, today });
  return new Response(out as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="agreement-preview-${key.toLowerCase()}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
