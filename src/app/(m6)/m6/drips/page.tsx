export const runtime = "edge";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { requireM6Session } from "@/lib/m6-scope";
import { isInternalRole } from "@/lib/permissions";
import { M6_DRIP_CAMPAIGN } from "@/lib/drip-rules";
import { M6_SENDING_NUMBER } from "@/lib/m6-cadence";
import DripRulesManager from "@/components/DripRulesManager";

export const metadata = { title: "Drip settings" };

export default async function M6DripsPage() {
  const sb = await supabaseServer();
  const session = await requireM6Session(sb);
  if (!session.ok) return null;
  const staff = isInternalRole(session.user.role);
  const canEdit = ["owner", "admin"].includes(session.user.role);

  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Drip settings</h1>
        <p className="m6-sub">
          Same sender every time: {M6_SENDING_NUMBER}. Same list the staff Settings screen uses, Motel 6 only.
        </p>
      </div>
      {staff ? (
        <section className="m6-card">
          <DripRulesManager lockedCampaign={M6_DRIP_CAMPAIGN} canEdit={canEdit} variant="m6" />
          {!canEdit && (
            <p className="m6-hint">Ask an admin if you need a new step, or to pause one.</p>
          )}
        </section>
      ) : (
        <section className="m6-card">
          <p>These messages go out on a schedule. Innovative writes them.</p>
          <p className="m6-hint">Open a file to send one now. Quiet hours are 8am to 8pm.</p>
          <p><Link href="/m6/cases">Open a file</Link></p>
        </section>
      )}
    </div>
  );
}
