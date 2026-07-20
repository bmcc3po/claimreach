export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import StatusBadge from "@/components/ui/StatusBadge";

export default async function QaQueuePage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const { data: me } = await sb.from("app_users").select("role").eq("id", user!.id).maybeSingle();
  if (!me || !["owner", "admin", "qa"].includes(me.role)) redirect("/dashboard");

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

  // Safety net: leads flagged qa_pending whose claim status may not have caught
  // up (status landed on the lead but not the claim row). Surfaces them anyway.
  const { data: flagged } = await sb.from("leads")
    .select("id, lead_no, claimant_name, phone, case_type, updated_at, qa_pending, claims(status, grievous_verdict)")
    .eq("qa_pending", true).limit(300);
  for (const l of flagged ?? []) {
    if (map.has(l.id)) continue;
    const st = (l as any).claims?.[0]?.status ?? "qa";
    map.set(l.id, { id: l.id, lead_no: l.lead_no, claimant_name: l.claimant_name, phone: l.phone, case_type: l.case_type, updated_at: l.updated_at, claims: [{ status: st, grievous_verdict: (l as any).claims?.[0]?.grievous_verdict }] });
  }

  const queue = Array.from(map.values()).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));

  const verdictLabel: Record<string, string> = { wip: "Grievous: WIP", flag: "Grievous: Flag BMC", ready: "Grievous: Ready to send" };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>QA queue</h2>
      <p className="muted" style={{ marginTop: 0 }}>Files Grievous has reviewed and passed to QA. Open a file to review, grade, and route it.</p>
      <div className="table-scroll">
        <table className="docket">
          <thead><tr><th>File</th><th>Claimant</th><th>Type</th><th>Status</th><th>Grievous call</th><th>Waiting</th></tr></thead>
          <tbody>
            {(queue ?? []).map((l: any) => {
              const c = (l.claims ?? [])[0] ?? {};
              const days = Math.floor((Date.now() - new Date(l.updated_at).getTime()) / 86400000);
              return (
                <tr key={l.id}>
                  <td><Link href={`/leads/${l.id}`}>{l.lead_no}</Link></td>
                  <td style={{ fontWeight: 600 }}>{l.claimant_name || "—"}</td>
                  <td>{l.case_type || c.claim_type || "—"}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="muted">{verdictLabel[c.grievous_verdict] || "—"}</td>
                  <td className="muted">{days === 0 ? "today" : `${days}d`}</td>
                </tr>
              );
            })}
            {(queue ?? []).length === 0 && <tr><td colSpan={6} className="muted">Nothing in the QA queue right now.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
