export const runtime = "edge";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { HEALTH_LABEL, daysAgo, filterM6StatusRows, type Health } from "@/lib/m6";
import { applyM6LeadFilters, getTmpFirmId, M6_STATUS_COLUMNS } from "@/lib/m6-scope";

// The home screen, and the reason anyone opens this app. If it is right, nobody
// has to decide what to do next. Four stacks, in the order a caller works them.

type Row = {
  lead_id: string; lead_no: string; claimant_name: string | null;
  health: Health; days_overdue: number; days_since_contact: number;
  last_two_way_at: string | null; next_touch_due: string | null;
  ladder_step: number | null; retention_owner: string | null;
  live_contact_points: number;
};

function Stack({ title, note, rows, empty }: {
  title: string; note: string; rows: Row[]; empty: string;
}) {
  return (
    <section className="m6-stack">
      <div className="m6-stack-head">
        <h2>{title}</h2>
        <span className="m6-count">{rows.length}</span>
      </div>
      <p className="m6-stack-note">{note}</p>
      {rows.length === 0 ? (
        <p className="m6-empty">{empty}</p>
      ) : (
        <ul className="m6-rows">
          {rows.map((r) => (
            <li key={r.lead_id}>
              <Link href={`/m6/cases/${r.lead_id}`} className="m6-row">
                <span className={`m6-dot ${r.health}`} aria-hidden="true" />
                <span className="m6-row-main">
                  <span className="m6-row-name">{r.claimant_name || "Unnamed file"}</span>
                  <span className="m6-row-sub">
                    {r.lead_no}
                    {" · "}
                    {r.last_two_way_at ? `reached ${daysAgo(r.last_two_way_at)}` : "never reached"}
                    {r.live_contact_points === 0 && " · no way to reach them"}
                  </span>
                </span>
                <span className="m6-row-tag">
                  {r.health === "paused" ? "Paused"
                    : r.ladder_step ? `Step ${r.ladder_step}`
                    : HEALTH_LABEL[r.health]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function TodayPage() {
  const sb = await supabaseServer();
  const tmpFirmId = await getTmpFirmId(sb);

  const { data, error } = tmpFirmId
    ? await applyM6LeadFilters(
        sb.from("lead_contact_status").select(M6_STATUS_COLUMNS),
        tmpFirmId,
      ).order("days_overdue", { ascending: false }).limit(400)
    : { data: [] as Row[], error: { message: "This app is not available." } };

  const rows = tmpFirmId
    ? filterM6StatusRows((data ?? []) as (Row & {
        firm_id: string;
        campaign?: string | null;
        case_type?: string | null;
        archived_at?: string | null;
      })[], tmpFirmId)
    : [];

  // Never contacted comes first on purpose: a file nobody has ever reached is
  // more fragile than one that has gone quiet, because there is no contact web
  // on it yet and the escalation ladder runs out of moves by step four.
  const neverReached = rows.filter((r) => !r.last_two_way_at && r.health !== "paused");
  const overdue      = rows.filter((r) => r.last_two_way_at && r.days_overdue > 0 && r.health !== "lost");
  const lost         = rows.filter((r) => r.health === "lost" && r.last_two_way_at);
  const unclaimed    = rows.filter((r) => !r.retention_owner && r.health !== "paused" && r.days_overdue > 0);

  return (
    <div className="m6-page">
      <div className="m6-head">
        <h1>Today</h1>
        <p className="m6-sub">
          Everything that needs a call, a text, or a decision. Work top down.
        </p>
      </div>

      {error && (
        <p className="m6-error">
          Could not load the queue: {error.message}
        </p>
      )}

      <div className="m6-stacks">
        <Stack
          title="Never reached"
          note="Signed, but nobody has confirmed two-way contact yet. Highest risk on the board."
          rows={neverReached}
          empty="Every file has been reached at least once."
        />
        <Stack
          title="Overdue"
          note="Past their check-in window. The ladder step tells you what happens next."
          rows={overdue}
          empty="Nothing is overdue."
        />
        <Stack
          title="Unclaimed"
          note="Overdue with nobody's name on it. These are the ones that quietly rot."
          rows={unclaimed}
          empty="Every overdue file has an owner."
        />
        <Stack
          title="Lost contact"
          note="Past step nine. The firm decides whether to spend on an investigator."
          rows={lost}
          empty="No files have been given up on."
        />
      </div>
    </div>
  );
}
