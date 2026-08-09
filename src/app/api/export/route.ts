import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
export const runtime = "edge";

function csvEscape(v: any): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// GET /api/export?format=neos — CSV of leads+claims mapped to import-friendly columns.
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return new Response("unauthorized", { status: 401 });
  const { data: me } = await sb.from("app_users").select("role, firm_id").eq("id", auth.user.id).maybeSingle();
  if (!me || me.role === "firm") return new Response("forbidden", { status: 403 });

  const { data: leads } = await sb.from("leads")
    .select("lead_no, claimant_name, phone, email, address, dob, best_time, language, ec1_name, ec1_phone, ec1_relation, ec2_name, ec2_phone, ec2_relation, claims(campaign, claim_type, status, stage, case_summary, primary_dx, qualification)")
    .order("created_at", { ascending: false }).limit(5000);

  const headers = [
    "Lead ID","First Name","Last Name","Phone","Email","Address","DOB","Best Time","Language",
    "Case Type","Campaign","Status","Stage","Qualification","Case Description","Primary Dx",
    "Emergency Contact 1","EC1 Phone","EC1 Relation","Emergency Contact 2","EC2 Phone","EC2 Relation",
  ];

  const lines = [headers.join(",")];
  for (const l of leads ?? []) {
    const name = (l.claimant_name ?? "").trim();
    const sp = name.lastIndexOf(" ");
    const first = sp > 0 ? name.slice(0, sp) : name;
    const last = sp > 0 ? name.slice(sp + 1) : "";
    const claimList = (l.claims ?? []).length ? l.claims : [{}];
    for (const c of claimList as any[]) {
      lines.push([
        l.lead_no, first, last, l.phone, l.email, l.address, l.dob, l.best_time, l.language,
        c.claim_type, c.campaign, c.status, c.stage, c.qualification, c.case_summary, c.primary_dx,
        l.ec1_name, l.ec1_phone, l.ec1_relation, l.ec2_name, l.ec2_phone, l.ec2_relation,
      ].map(csvEscape).join(","));
    }
  }

  const csv = lines.join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="claimreach-export-${stamp}.csv"`,
    },
  });
}
