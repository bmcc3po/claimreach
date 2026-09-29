export const runtime = "edge";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { LEAD_CALL_COLS } from "@/lib/mva-call/server";
import { caseReport } from "@/lib/mva-call/report";
import PrintActions from "@/components/calls/PrintActions";
import CanonicalUrl from "@/components/CanonicalUrl";
import { resolveLeadKey, leadKeyOf } from "@/lib/lead-key";
import { resolveSigningMatter, getMatterAgreement, agreementIsVoided } from "@/lib/mva-call/signing-matter";
import { matterRowsFilter } from "@/lib/matter";

// The whole case on one page: the automatic summary, the six qualifiers,
// every intake question with its answer, and the agreement. Print it from the
// phone (Share, Print) or email it. No SSN on this page, ever.
export default async function PrintCase({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ claim?: string }> }) {
  const { id: key } = await params;
  const sb = await supabaseServer();
  const id = await resolveLeadKey(sb, key);
  if (!id) notFound();
  const context = await resolveSigningMatter(sb, id, { claimId: (await searchParams).claim, allowArchived: true });
  if (!context.ok) return <div className="cc-print"><h1>Choose a matter before exporting</h1><p>{context.error}</p><a href={`/leads/${encodeURIComponent(key)}`}>Review file</a></div>;
  const { lead, matter } = context;
  const claim = matter.claim;
  const [{ data: call }, agreement] = await Promise.all([
    sb.from("intake_calls").select("answers, agent_name, updated_at").eq("lead_id", id).or(matterRowsFilter(matter)).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    getMatterAgreement(sb, lead, matter),
  ]);
  if (!agreement.ok) throw new Error(agreement.error);
  const sub = agreementIsVoided(agreement.row) ? null : agreement.row;
  const r = caseReport({ ...lead, campaign: claim.campaign, case_type: claim.claim_type }, claim.answers?.mva_call || call?.answers || {}, sub);
  const status = claim?.status ? String(claim.status).replace(/_/g, " ") : "";

  return (
    <div className="cc-print cr-report">
      <CanonicalUrl path={`/app/${leadKeyOf(lead)}/print`} />
      <a className="cc-home-link cc-noprint" href={`/app/${leadKeyOf(lead)}?claim=${claim.id}`}>Back to the call</a>
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

      <PrintActions leadId={id} claimId={claim.id} agreementId={sub?.id} hasPdf={r.agreement.hasPdf} />
    </div>
  );
}
