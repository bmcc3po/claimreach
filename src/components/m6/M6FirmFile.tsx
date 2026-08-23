"use client";
import LeadWorkspace from "@/components/LeadWorkspace";
import LorCard from "./LorCard";
import LogTouchButton from "./LogTouchButton";
import { stayRangeLabel, type IdentifiedProperty } from "@/lib/property-tool";
import type { FileFence } from "@/lib/file-fence";

export default function M6FirmFile({
  lead, claims, claimProperties, audit, notes, callLogs, staff, formsByType,
  retainers, signables, fence, lor, identified, points,
}: {
  lead: any;
  claims: any[];
  claimProperties: Record<string, any[]>;
  audit: any[];
  notes: any[];
  callLogs: any[];
  staff: { id: string; full_name: string }[];
  formsByType: Record<string, any[]>;
  retainers: any[];
  signables: any[];
  fence: FileFence;
  lor: any;
  identified: IdentifiedProperty[];
  points: { id: string; kind: string; value: string; label: string | null; status: string }[];
}) {
  const live = points.filter((p) => p.status !== "dead");

  return (
    <div className="m6-page m6-file">
      {lead.comms_monitored && (
        <p className="m6-warn">
          Communications may be monitored. No voicemail, nothing identifying in a
          text, and follow the approved script with anyone else who answers.
        </p>
      )}
      <LorCard leadId={lead.id} lor={lor} />
      {!!identified.length && (
        <section className="m6-card m6-identified">
          <h2>Identified properties</h2>
          <ul className="m6-points">
            {identified.map((p) => {
              const where = [p.street || p.address, p.city, p.state, p.zip].filter(Boolean).join(", ");
              const when = stayRangeLabel(p.stay_from, p.stay_to);
              return (
                <li key={p.id}>
                  <div>
                    <span className="m6-point-val">{p.name || "Property"}</span>
                    {where && <span className="m6-point-lab">{where}</span>}
                    <span className="m6-point-lab">
                      Remembered as {p.remembered_brand || "not noted"}
                      {p.current_brand ? ` · current flag ${p.current_brand}` : ""}
                      {when ? ` · ${when}` : ""}
                    </span>
                    {p.brand_mismatch && (
                      <span className="m6-id-flag">Remembered brand differs from the current flag</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <LeadWorkspace
        lead={lead}
        claims={claims}
        activity={[]}
        claimProperties={claimProperties}
        audit={audit}
        notes={notes}
        callLogs={callLogs}
        staff={staff}
        formsByType={formsByType}
        fence={fence}
        retainers={retainers}
        signables={signables}
        headerActions={<LogTouchButton leadId={lead.id} points={live} />}
      />
    </div>
  );
}
