import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

const PARTNER = "pr-digital";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me, error: meError } = await sb.from("app_users")
    .select("id, role, active").eq("id", user.id).maybeSingle();
  if (meError || !me || me.role !== "owner" || me.active === false) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const admin = supabaseAdmin();

  if (body.op === "create_account") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) return NextResponse.json({ error: "valid email required" }, { status: 400 });
    // Partner credentials must never be shared with a staff/firm identity.
    const [staff, prior] = await Promise.all([
      admin.from("app_users").select("id").eq("email", email).limit(1),
      admin.from("partner_accounts").select("auth_user_id").eq("email", email).limit(1),
    ]);
    if (staff.error || prior.error) return NextResponse.json({ error: "could not verify identity separation" }, { status: 503 });
    if (staff.data?.length || prior.data?.length) return NextResponse.json({ error: "email already belongs to a ClaimReach account" }, { status: 409 });
    const created = await admin.auth.admin.createUser({ email, email_confirm: true,
      app_metadata: { account_type: "partner" } });
    if (created.error || !created.data.user) return NextResponse.json({ error: created.error?.message || "account creation failed" }, { status: 500 });
    const saved = await admin.from("partner_accounts").insert({
      auth_user_id: created.data.user.id, email, partner_key: PARTNER, active: true,
    });
    if (saved.error) {
      const cleanup = await admin.auth.admin.deleteUser(created.data.user.id);
      return NextResponse.json({ error: cleanup.error
        ? "Partner profile failed; unused auth account needs owner review"
        : "Partner profile failed; unused auth account was removed" }, { status: 500 });
    }
    // createUser does not send a sign-in email. The partner requests a magic
    // link from /partner-login after the owner has verified the destination.
    return NextResponse.json({ ok: true, email, sign_in_path: "/partner-login" });
  }

  if (body.op === "approve_lawruler_ids") {
    const ids = body.source_lead_ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 ||
      ids.some((id: unknown) => typeof id !== "string" || !/^\d{1,30}$/.test(id))) {
      return NextResponse.json({ error: "supply 1–100 exact LawRuler lead IDs" }, { status: 400 });
    }
    const unique = [...new Set(ids as string[])];
    if (unique.length !== ids.length) return NextResponse.json({ error: "duplicate source IDs" }, { status: 400 });
    const firm = await admin.from("firms").select("id").eq("slug", "tmp").maybeSingle();
    if (firm.error || !firm.data) return NextResponse.json({ error: "TMP firm unavailable" }, { status: 503 });
    const firmId = firm.data.id;
    const existing = await admin.from("partner_source_leads").select("source_lead_id, firm_id")
      .eq("partner_key", PARTNER).eq("source_system", "lawruler").in("source_lead_id", unique);
    if (existing.error) return NextResponse.json({ error: "could not check current approvals" }, { status: 503 });
    if ((existing.data || []).some(row => row.firm_id !== firmId)) {
      return NextResponse.json({ error: "one source ID is already approved for another firm" }, { status: 409 });
    }
    const already = new Set((existing.data || []).map(row => row.source_lead_id));
    const pending = unique.filter(id => !already.has(id));
    if (pending.length) {
      const inserted = await admin.from("partner_source_leads").insert(pending.map(id => ({
        partner_key: PARTNER, source_system: "lawruler", source_lead_id: id,
        firm_id: firmId, approved_by: me.id,
      })));
      if (inserted.error) return NextResponse.json({ error: "partner ID approval failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, approved_total: unique.length, newly_approved: pending.length });
  }
  return NextResponse.json({ error: "unknown operation" }, { status: 400 });
}
