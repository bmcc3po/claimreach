export const runtime = "edge";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { LEAD_CALL_COLS } from "@/lib/mva-call/server";
import { caseReport } from "@/lib/mva-call/report";
import PrintActions from "@/components/calls/PrintActions";
import CanonicalUrl from "@/components/CanonicalUrl";
import { resolveLeadKey, leadKeyOf } from "@/lib/lead-key";

// The whole case on one page: the automatic summary, the six qualifiers,
// every intake question with its answer, and the agreement. Print it from the
// phone (Share, Print) or email it. No SSN on this page, ever.
export default async function PrintCase({ params }: { params: Promise<{ id: string }> }) {
  const { id: key } = await params;
  const sb = await supabaseServer();
  const id = await resolveLeadKey(sb, key);
  if (!id) notFound();
  const { data: lead } = await sb.from("leads").select(LEAD_CALL_COLS).eq("id", id).maybeSingle();
  if (!lead) notFound();
  const [{ data: call }, { data: sub }, { data: claim }] = await Promise.all([
    sb.from("intake_calls").select("answers, agent_name, updated_at").eq("lead_id", id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("esign_submissions").select("id, status, template_key, signer_name, injured_name, sent_at, signed_at, completed_at, completed_pdf_path")
      .eq("lead_id", id).is("pax_index", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("claims").select("status").eq("lead_id", id).order("created_at", { ascending: true }).limit(1).maybeSingle(),
  ]);
  const r = caseReport(lead, call?.answers || {}, sub);
  const status = claim?.status ? String(claim.status).replace(/_/g, " ") : "";

  return (
    <div className="cc-print cr-report">
      <CanonicalUrl path={`/app/${leadKeyOf(lead)}/print`} />
      <a className="cc-home-link cc-noprint" href={`/app/${leadKeyOf(lead)}`}>Back to the call</a>
      <h1>{r.name}</h1>
      <div className="cr-sub">{[r.sub, status, call?.agent_name ? `Intake by ${call.agent_name}` : ""].filter(Boolean).join(", ")}</div>

      <section className="cr-box">
        <h2>Case summary</h2>
        {r.summary.length ? r.summary.map((p, i) => <p key={i}>{p}</p>) : <p className="cr-dim">Nothing captured yet.</p>}
      </section>

      <div className="cr-lights">
        {r.lights.map((l) => <div key={l.label} className={`cr-light cr-l-${l.state || "none"}`}><i />{l.label}<b>{l.word}</b></div>)}
      </div>

      {r.sections.filter((s) => s.rows.length).map((s) => (
        <section key={s.id} className="cr-sec">
          <h2>{s.title}</h2>
          <table><tbody>
            {s.rows.map((row, i) => (
              <tr key={i} className={row.flag ? "cr-flag" : row.missing ? "cr-missing" : ""}><td>{row.q}</td><td>{row.a}</td></tr>
            ))}
          </tbody></table>
        </section>
      ))}

      <section className="cr-sec">
        <h2>Agreement</h2>
        <div className="cr-box cr-agr">
          {r.agreement.line}
          {r.agreement.hasPdf && !!sub && <a className="cc-noprint" href={`/api/calls/esign/doc/${sub.id}/signed`} target="_blank" rel="noopener">Open the signed agreement</a>}
        </div>
      </section>

      <PrintActions leadId={id} hasPdf={r.agreement.hasPdf} />
    </div>
  );
}
