import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase-server";
import { computeAlerts } from "@/lib/alerts";
import { scopeWorkArea, workArea } from '@/lib/work-area';

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role === "firm") return NextResponse.json({ alerts: [], count: 0 });
  const all = await computeAlerts(sb);
  const ids: string[] = [];
  for (let start = 0; start < all.length; start += 100) {
    const r = await scopeWorkArea(sb.from('leads').select('id').in('id', all.slice(start, start + 100).map(a => a.lead_id)).is('archived_at', null), workArea(req.nextUrl.searchParams.get('area')));
    if (r.error) return NextResponse.json({ error: 'Could not load alerts.' }, { status: 503 });
    ids.push(...(r.data || []).map((l: any) => l.id));
  }
  const alerts = all.filter(a => ids.includes(a.lead_id));
  return NextResponse.json({ alerts, count: alerts.length });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("role").eq("id", auth.user.id).maybeSingle();
  if (!me || !["owner", "admin"].includes(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  const patch: any = { updated_at: new Date().toISOString() };
  for (const k of ["no_contact_hours", "qa_stuck_hours", "signed_unreviewed_hours", "stage_stale_hours"]) {
    if (Number.isFinite(b[k])) patch[k] = b[k];
  }
  const { error } = await supabaseAdmin().from("sla_settings").update(patch).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
