import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { requireStaff } from "@/lib/mva-call/server";
import { resolveSigningMatter } from "@/lib/mva-call/signing-matter";
import { getIdentityMetadata, saveIdentity } from "@/lib/mva-call/identity";

export const runtime = "edge";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return reply({ error: "Sign in to view saved identity status." }, 401);
  const url = new URL(req.url);
  const context = await resolveSigningMatter(sb, url.searchParams.get("lead_id") || "", { claimId: url.searchParams.get("claim_id") });
  if (!context.ok) return reply({ error: context.error }, context.status);
  const result = await getIdentityMetadata(supabaseAdmin(), { leadId: context.lead.id, firmId: context.lead.firm_id, claimId: context.matter.claim.id });
  return result.ok ? reply(result.identity) : reply({ error: result.error }, result.status);
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const me = await requireStaff(sb);
  if (!me) return reply({ error: "Sign in to save identity information." }, 401);
  const body = await req.json().catch(() => null);
  if (!body || typeof body.lead_id !== "string" || typeof body.claim_id !== "string") return reply({ error: "Choose the file and matter before saving identity information." }, 400);
  const context = await resolveSigningMatter(sb, body.lead_id, { claimId: body.claim_id });
  if (!context.ok) return reply({ error: context.error }, context.status);
  // This action intentionally has no agreement-status gate: agents can save
  // identity before sending, while waiting, or after the client signs.
  const result = await saveIdentity(supabaseAdmin(), { leadId: context.lead.id, firmId: context.lead.firm_id, claimId: context.matter.claim.id }, {
    ssn: body.ssn, mode: body.mode, expectedVersion: body.expected_version, actorId: me.id,
  });
  return result.ok ? reply({ ok: true, ...result.identity }) : reply({ error: result.error }, result.status);
}
