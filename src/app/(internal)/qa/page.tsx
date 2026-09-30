export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import { authUser } from "@/lib/auth-user";
import { redirect } from "next/navigation";
import Link from "next/link";
import StatusBadge from "@/components/ui/StatusBadge";
import { needsQaReview } from "@/lib/statuses";

export default async function QaQueuePage() {
  const sb = await supabaseServer();
  const { data: { user } } = await authUser();
  const { data: me } = await sb.from("app_users").select("role").eq("id", user!.id).maybeSingle();
  if (!me || !["owner", "admin", "manager", "qa"].includes(me.role)) redirect("/dashboard");
  const { data: statuses } = await sb.from("statuses").select("*");

  // Read by STATUS (the source of truth), not just the qa_pending flag, so a
  // file in a QA-phase status can never be missing from the queue if the flag
  // drifted. In-QA statuses: grievous/qa on both the no-sig and signed tracks.
  const QA_STATUSES = ["grievous", "qa", "signed_grievous", "signed_qa"];
  const { data: claimRows } = await sb.from("claims")
    .select("lead_id, status, grievous_verdict, claim_type, updated_at, leads(id, lead_no, claimant_name, phone, case_type, updated_at)")
    .in("status", QA_STATUSES).order("updated_at", { ascending: false }).limit(300);

  const map = new Map<string, any>();
  for (const c of claimRows ?? []) {
    if (!(c as any).leads) continue;
    const l = (c as any).leads;
    map.set(l.id, { id: l.id, lead_no: l.lead_no, claimant_name: l.claimant_name, phone: l.phone, case_type: l.case_type, updated_at: c.updated_at, claims: [{ status: c.status, grievous_verdict: c.grievous_verdict }] });
  }

  // A stale lead flag never puts a closed/DQ matter back in QA. Resolve the
  // actual reviewable claim, including when a closed sibling comes first.
  const { data: flagged } = await sb.from("leads")
    .select("id, lead_no, claimant_name, phone, case_type, updated_at, qa_pending, claims(status, grievous_verdict)")
    .eq("qa_pending", true).limit(300);
  for (const l of flagged ?? []) {
    if (map.has(l.id)) continue;
    const review = (l as any).claims?.find((c: any) => needsQaReview(c.status, statuses ?? undefined));
    if (!review) continue;
    map.set(l.id, { id: l.id, lead_no: l.lead_no, claimant_name: l.claimant_name, phone: l.phone, case_type: l.case_type, updated_at: l.updated_at, claims: [{ status: review.status, grievous_verdict: review.grievous_verdict }] });
  }

  const queue = Array.from(map.values()).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));

  const verdictLabel: Record<string, string> = { wip: "Grievous: WIP", flag: "Grievous: Flag BMC", ready: "Grievous: Ready to send" };

  return (
    <div>
      <div className="cl-head">
        <div>
          <h1 className="cl-h1">QA queue <small>{queue.length}</small></h1>
          <p className="cl-lede">Files Grievous has reviewed and passed to QA. Open a file to review, grade, and route it.</p>
        </div>
      </div>
      <div className="cl-tablewrap">
        <table className="cl-table">
          <thead><tr><th>File</th><th>Claimant</th><th>Type</th><th>Status</th><th>Grievous call</th><th>Waiting</th></tr></thead>
          <tbody>
            {(queue ?? []).map((l: any) => {
              const c = (l.claims ?? [])[0] ?? {};
              const days = Math.floor((Date.now() - new Date(l.updated_at).getTime()) / 86400000);
              return (
                <tr key={l.id}>
                  <td><Link className="cl-mono" href={`/leads/${l.id}`}>{l.lead_no}</Link></td>
                  <td className="cl-t1">{l.claimant_name || "—"}</td>
                  <td>{l.case_type || c.claim_type || "—"}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="cl-t2">{verdictLabel[c.grievous_verdict] || "—"}</td>
                  <td className="cl-t2">{days === 0 ? "today" : `${days}d`}</td>
                </tr>
              );
            })}
            {(queue ?? []).length === 0 && <tr><td colSpan={6}><div className="cl-empty"><b>Nothing in the QA queue</b>Files land here when Grievous passes them to QA.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
