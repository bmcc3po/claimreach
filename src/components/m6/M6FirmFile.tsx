"use client";
import LeadWorkspace from "@/components/LeadWorkspace";
import LorCard from "./LorCard";
import LogTouchButton from "./LogTouchButton";
import ComposePanel from "./ComposePanel";
import FileActions from "./FileActions";
import Link from "next/link";
import { propertyFileHref, type IdentifiedProperty } from "@/lib/property-tool";
import IdentifiedStays from "@/components/IdentifiedStays";
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
  const live = points.filter((p) => p.status !== "dead" && p.status !== "opted_out");
  const phone = lead.phone || live.find((p) => p.kind === "mobile" || p.kind === "landline")?.value || null;

  return (
    <div className="m6-page m6-file">
      {lead.comms_monitored && (
        <p className="m6-warn">
          Communications may be monitored. No voicemail, nothing identifying in a
          text, and follow the approved script with anyone else who answers.
        </p>
      )}
      <div className="m6-file-acts m6-file-acts-top">
        <FileActions file={{ id: lead.id, name: lead.claimant_name || lead.full_name, phone }} />
      </div>
      <LorCard leadId={lead.id} lor={lor} />
      <ComposePanel leadId={lead.id} isStaff={false} />
      <p className="m6-hint">
        <Link href={propertyFileHref(lead)}>
          Look up a property
        </Link>
      </p>
      <IdentifiedStays properties={identified} />
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
