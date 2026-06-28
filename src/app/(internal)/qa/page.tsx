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

  const { data: queue } = await sb.from("leads")
    .select("id, lead_no, claimant_name, phone, case_type, updated_at, claims(status, grievous_verdict)")
    .eq("qa_pending", true).order("updated_at", { ascending: false }).limit(300);

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
