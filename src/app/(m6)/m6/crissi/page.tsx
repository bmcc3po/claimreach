export const runtime = "edge";
import { supabaseServer } from "@/lib/supabase-server";
import { assertM6Write, requireM6Session } from "@/lib/m6-scope";
import { displayName } from "@/lib/m6";
import M6CrissiChat from "@/components/m6/M6CrissiChat";
import { redirect } from "next/navigation";

export default async function M6CrissiPage({
  searchParams,
}: {
  searchParams: Promise<{ file?: string; lead?: string }>;
}) {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) redirect("/firm-login");

  const sp = await searchParams;
  const leadId = sp.file || sp.lead || "";
  let file: { id: string; name: string; leadNo: string | null; commsMonitored?: boolean } | null = null;
  if (leadId) {
    const gate = await assertM6Write(
      sb, leadId,
      "id, firm_id, campaign, case_type, archived_at, first_name, last_name, full_name, claimant_name, lead_no, comms_monitored",
    );
    if (gate.ok) {
      file = {
        id: gate.lead.id,
        name: displayName(gate.lead),
        leadNo: gate.lead.lead_no ?? null,
        commsMonitored: !!gate.lead.comms_monitored,
      };
    }
  }

  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Crissi</h1>
        <p className="m6-sub">
          Live help for this call. Motel 6 words only. Stay, connect, escalate.
        </p>
      </div>
      <M6CrissiChat file={file} />
    </div>
  );
}
