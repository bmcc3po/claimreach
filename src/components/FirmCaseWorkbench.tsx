import CaseDocuments from "./CaseDocuments";
import { statusLabel } from "@/lib/statuses";

type FileIdentity = { id: string; lead_no?: string; claimant_name?: string; firm_ref_no?: string };
type ReleasedMatter = { id: string; claim_type?: string; status?: string };

// Start with released documents. Internal stage, scoring, messaging and
// lead-wide export controls do not belong in this read-only view.
export default function FirmCaseWorkbench({ lead, claim, locked = false }: {
  lead: FileIdentity; claim?: ReleasedMatter; locked?: boolean;
}) {
  const available = !locked && !!claim;
  return (
    <div style={{ maxWidth: 1120, margin: "0 auto" }}>
      <a href="/portal/cases" className="btn ghost sm">← All files</a>
      <header style={{ margin: "20px 0" }}>
        <h1 style={{ margin: "0 0 8px", overflowWrap: "anywhere" }}>{lead.claimant_name || lead.lead_no || "Client file"}</h1>
        <p className="muted" style={{ margin: "0 0 12px" }}>
          {[lead.lead_no, available && claim?.claim_type, lead.firm_ref_no && `Firm reference ${lead.firm_ref_no}`].filter(Boolean).join(" · ")}
        </p>
        <span className="badge stage">{available ? statusLabel(claim?.status) : "Awaiting file review"}</span>
      </header>
      {!available ? (
        <section className="card" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>The intake team is finishing this file</h2>
          <p className="muted">Its documents will be available here once the file is released to your firm.</p>
        </section>
      ) : (
        <section className="card" style={{ padding: "clamp(16px, 3vw, 28px)" }}>
          <h2 style={{ marginTop: 0 }}>File documents</h2>
          <p className="muted">Open a document below to review or download it.</p>
          <CaseDocuments key={claim.id} leadId={lead.id} claimId={claim.id} readOnly />
        </section>
      )}
    </div>
  );
}
