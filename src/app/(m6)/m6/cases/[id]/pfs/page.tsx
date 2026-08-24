export const runtime = "edge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { assertM6Write } from "@/lib/m6-scope";
import { PFS_FORM_KEY, pfsAnswersOnly } from "@/lib/pfs";
import type { Field } from "@/lib/questionnaire";
import PfsFill from "@/components/m6/PfsFill";

export const metadata = { title: "Questionnaire" };

export default async function M6FilePfsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const gate = await assertM6Write(sb, id, "id, firm_id, campaign, case_type, archived_at, lead_no, claimant_name");
  if (!gate.ok) notFound();

  const { data: form } = await sb.from("intake_forms")
    .select("fields, name")
    .eq("claim_type", PFS_FORM_KEY)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: claim } = await sb.from("claims")
    .select("id, answers")
    .eq("lead_id", id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!form?.fields || !Array.isArray(form.fields) || form.fields.length === 0) {
    return (
      <div className="m6-page">
        <div className="m6-head">
          <Link href={`/m6/cases/${id}`} className="m6-back">File</Link>
          <h1>Questionnaire</h1>
          <p className="m6-sub">{gate.lead.claimant_name || "This file"} · {gate.lead.lead_no}</p>
        </div>
        <section className="m6-card">
          <p>No questionnaire yet.</p>
          <p className="m6-hint">Import an intake questionnaire, or add a question on the Questionnaire page. Until then this stays empty.</p>
          <p><Link href="/m6/pfs">Go to Questionnaire</Link></p>
        </section>
      </div>
    );
  }

  return (
    <PfsFill
      leadId={id}
      leadName={gate.lead.claimant_name || "Unnamed file"}
      leadNo={gate.lead.lead_no || ""}
      claimId={claim?.id ?? null}
      fields={form.fields as Field[]}
      initialAnswers={pfsAnswersOnly(claim?.answers ?? {})}
    />
  );
}
