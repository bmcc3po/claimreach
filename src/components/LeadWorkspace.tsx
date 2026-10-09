"use client";
import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LX } from "@/lib/lexicon";
import FloatingDock from "./FloatingDock";
import IntakeSurface from "./IntakeSurface";
import CaseOverview from "./CaseOverview";
import StatusBadge from "./ui/StatusBadge";
import FileStatusControl from "./FileStatusControl";
import { resolveFileStatus } from "@/lib/statuses";
import FileArchiveButton from "./FileArchiveButton";
import FileHeader, { FileHeaderDialog } from "./FileHeader";
import FileOutcomeActions from "./FileOutcomeActions";
import { fileAgentSummary } from '@/lib/file-agents';
import { areaHref, inWorkArea } from '@/lib/work-area';
import ActivityLog from "./ActivityLog";
import ContactInfo from "./ContactInfo";
import CaseDetails from "./CaseDetails";
import CaseDocuments from "./CaseDocuments";
import OwnerFirmDownload from "./calls/OwnerFirmDownload";
import ImportedPacketHandoff from "./calls/ImportedPacketHandoff";
import ExternalFirmDelivery from "./calls/ExternalFirmDelivery";
import RetainerTab from "./RetainerTab";
import NotesTab from "./NotesTab";
import CommsTimeline from "./CommsTimeline";
import QaPanel from "./QaPanel";
import CaseTimeline from "./CaseTimeline";
import {
  INTERNAL_STAFF_FENCE, fileBackHref, fileMayEditLead, fileMayExportPdf,
  fileMayUseStaffTools, fileTabs, type FileFence,
} from "@/lib/file-fence";
import type { IdentifiedProperty } from "@/lib/property-tool";

interface Claim {
  id: string;
  claim_type: string;
  campaign: string | null;
  status: string;
  firm_send_result?: string | null;
  qualification: string;
  on_behalf_of: boolean;
  is_this_file: boolean;
  answers?: Record<string, any>;
  grievous_verdict?: string | null;
}

const TABS_HELP = "tabs are computed once in file-fence.ts";
type AppCall = { rows: { k: string; v: string }[]; answered: number; href: string; hasOld: boolean; when: string | null; agent: string | null; dispo: string | null };
const NAV_GROUPS = [
  { label: "Overview", tabs: ["Overview"] },
  { label: "Intake & details", tabs: ["Case Questions", "Contact Info", "Case Details"] },
  { label: "Documents & signing", tabs: ["Retainer"] },
  { label: "Communications", tabs: ["Messages", "Calls"] },
  { label: "History", tabs: ["Timeline", "Activity Log", "Notes"] },
  { label: "QA", tabs: ["QA"] },
];

export default function LeadWorkspace(props: Parameters<typeof LeadWorkspaceRecord>[0]) {
  return <LeadWorkspaceRecord key={props.lead.id} {...props} />;
}

function LeadWorkspaceRecord({
  lead, claims, activity, stats, claimProperties, audit, notes, callLogs, staff = [], formsByType = {},
  fence = INTERNAL_STAFF_FENCE, headerActions, retainers, signables, identified = [], lor = null,
  points = [], lastComm = null, appCall: defaultAppCall = null, appCalls = {}, linked = [], initialClaimId, formsByClaim = {},
}: {
  appCall?: AppCall | null;
  appCalls?: Record<string, AppCall>;
  initialClaimId?: string;
  formsByClaim?: Record<string, any[]>;
  linked?: { id: string; lead_no: string | null; name: string; label: string }[];
  lead: any;
  claims: Claim[];
  activity: any[];
  stats?: { signed: number; tierA: number; weekPay: number; wip: number };
  claimProperties: Record<string, any[]>;
  audit: any[];
  notes: any[];
  callLogs: any[];
  staff?: { id: string; full_name: string }[];
  formsByType?: Record<string, any[]>;
  fence?: FileFence;
  headerActions?: ReactNode;
  retainers?: any[];
  signables?: any[];
  identified?: IdentifiedProperty[];
  lor?: { status?: string | null; sent_on?: string | null; sent_to?: string | null } | null;
  points?: { id: string; kind: string; value: string; label?: string | null; status: string }[];
  lastComm?: { channel?: string; direction?: string; occurred_at?: string; outcome?: string; body?: string; agent_name?: string } | null;
}) {
  const [showOldForm, setShowOldForm] = useState(false);
  // The freshest saved values for this file in THIS session. A tab that
  // unmounts and comes back re-initializes from here, not from the stale
  // server props, so an edit cannot resurrect old values (Astra round 3).
  const [leadLive, setLeadLive] = useState<any>(lead);
  const liveUp = (patch: Record<string, any>) => setLeadLive((s: any) => ({ ...s, ...patch }));
  // A refreshed server record re-syncs the live copy (Astra round-3 review:
  // init-once ignored router refreshes). Editors initialize their own state
  // on mount, so this never resets active typing.
  useEffect(() => { setLeadLive((s: any) => ({ ...s, ...lead })); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [lead.updated_at]);
  const [activeClaimId, setActiveClaimId] = useState(
    claims.find((c) => c.id === initialClaimId)?.id ?? claims.find((c) => c.is_this_file)?.id ?? claims[0]?.id ?? null
  );
  const [tab, setTab] = useState("Overview");
  const [editMode, setEditMode] = useState(false);
  const router = useRouter();
  const [statusChanges, setStatusChanges] = useState<Record<string, string>>({});
  useEffect(() => { setStatusChanges({}); }, [claims]);
  const originalClaim = claims.find((c) => c.id === activeClaimId);
  const activeClaim = originalClaim && { ...originalClaim, status: statusChanges[originalClaim.id] || originalClaim.status };
  const statusChanged = (status: string) => { if (activeClaimId) setStatusChanges(old => ({ ...old, [activeClaimId]: status })); router.refresh(); };
  // A LawRuler-sourced lead can later be signed inside ClaimReach. Route by
  // this matter's signing workflow, not the lead's original source label.
  const importedSignedPacket = activeClaim?.claim_type === "mva" && lead.source_system === "lawruler" &&
    (activeClaim.status === "external_signed_review" ||
      (activeClaim.status === "delivered" && activity.some((row: any) =>
        row.meta?.event === "owner_signed_delivery_confirmation" && row.meta?.claim_id === activeClaimId && row.meta?.imported_approved === true)) ||
      (activeClaim.status === "signed_approved" && activity.some((row: any) =>
        row.meta?.event === "imported_packet_review" && row.meta?.claim_id === activeClaimId)));
  const appCall = activeClaimId ? appCalls[activeClaimId] ?? defaultAppCall : null;
  const matterNotes = notes.filter((n: any) => !n.claim_id || n.claim_id === activeClaimId);
  const matterAudit = audit.filter((a: any) => {
    const claimId = a.claim_id ?? a.meta?.claim_id;
    return claimId == null || claimId === activeClaimId;
  });
  const [showAddClaim, setShowAddClaim] = useState(false);
  const canEdit = fileMayEditLead(fence);
  const canTools = fileMayUseStaffTools(fence);
  const TABS = fileTabs(lead.current_user_role, fence);
  const navigation = NAV_GROUPS.map((g) => ({ ...g, tabs: g.tabs.filter((t) => TABS.includes(t as any)) })).filter((g) => g.tabs.length);
  const group = navigation.find((g) => g.tabs.includes(tab));
  const backHref = areaHref(fileBackHref(fence), inWorkArea(activeClaim?.claim_type, 'mva') ? 'mva' : 'other');
  const safe: string[] = Array.isArray(lead.comms_safe_channels) ? lead.comms_safe_channels : [];

  function claimClass(c: Claim) {
    if (c.status === "dq") return "claimchip dq";
    if (c.status === "signed") return "claimchip signed";
    if (c.id === activeClaimId) return "claimchip active";
    return "claimchip";
  }

  return (
    <div className="case-workspace">
      <FileHeader name={leadLive.claimant_name || "Unnamed claimant"} leadNo={lead.lead_no} backHref={backHref}
        status={<FileStatusControl key={activeClaimId} leadId={lead.id} claimId={activeClaim?.id} current={activeClaim?.status ?? lead.status ?? "new"} currentLabel={resolveFileStatus(activeClaim, undefined, claims.length === 1 && !!lead.signed_at).label} role={lead.current_user_role} signedDeclineAvailable={canTools && activeClaim?.claim_type === 'mva' && activeClaim.campaign === 'INNO MVA' && !lead.archived_at} onChanged={statusChanged} />}>
        <div className="file-header-details">
          {canTools && <strong>{fileAgentSummary(leadLive, staff, appCall?.agent)}</strong>}
          <CampaignPicker leadId={lead.id} current={activeClaim?.campaign || lead.campaign} role={claims.length === 1 ? lead.current_user_role : undefined} />
          {lead.firm_name && <span>Attorney: {lead.firm_name}</span>}
        </div>
        <div className="file-header-actions">
          {headerActions}
          {canTools && activeClaim && <FileOutcomeActions claimId={activeClaim.id} campaign={activeClaim.campaign} status={activeClaim.status} role={lead.current_user_role} archived={!!lead.archived_at} onChanged={statusChanged} />}
          {canEdit && <button type="button" className="cl-btn cl-ghost" onClick={() => { setTab('Contact Info'); setEditMode(false); }}>Client details</button>}
          {canTools && appCall && <a className="cl-btn" href={appCall.href}>Resume intake</a>}
          {fileMayExportPdf(fence) && <a className="cl-btn cl-ghost" href={'/api/export/intake-pdf?lead_id=' + lead.id + '&claim_id=' + (activeClaimId || '')} target="_blank" rel="noopener noreferrer">Intake PDF</a>}
          {canTools && ['owner', 'admin', 'manager', 'qa', 'agent'].includes(lead.current_user_role || '') && !importedSignedPacket && <SendToFirmButton key={activeClaimId} leadId={lead.id} claimId={activeClaim?.id} />}
          {canTools && <FileArchiveButton leadId={lead.id} label={leadLive.claimant_name || 'This file'} archivedAt={lead.archived_at} allowed={lead.current_user_can_archive === true} />}
          {canTools && <FileHeaderDialog label="More file actions">
            <LockFileButton lead={lead} />
            {activeClaimId && activeClaim?.claim_type === 'mva' && ['owner', 'admin'].includes(lead.current_user_role || '') && <OwnerFirmDownload key={activeClaimId} leadId={lead.id} claimId={activeClaimId} />}
            {activeClaimId && activeClaim?.claim_type === 'mva' && lead.current_user_role === 'owner' && !importedSignedPacket && ['signed_grievous', 'signed_qa', 'signed_wip', 'signed_approved', 'delivered'].includes(activeClaim.status) && <ExternalFirmDelivery key={activeClaimId} leadId={lead.id} claimId={activeClaimId} />}
            {activeClaimId && importedSignedPacket && <ImportedPacketHandoff key={activeClaimId} leadId={lead.id} claimId={activeClaimId} />}
          </FileHeaderDialog>}
        </div>
      </FileHeader>
      {claims.length > 1 && (
        <div className="claimsrow" style={{ margin: "0 0 12px" }}>
          {claims.map((c) => (
            <button key={c.id} className={`claimtab ${activeClaimId === c.id ? "on" : ""}`} onClick={() => { setActiveClaimId(c.id); setShowOldForm(false); setEditMode(false); const url = new URL(window.location.href); url.searchParams.set("claim", c.id); window.history.replaceState(window.history.state, "", url); }}>
              {(c.campaign || c.claim_type)}
            </button>
          ))}
        </div>
      )}

      {/* Files linked by the same wreck: the driver's and other passengers'.
          When this person calls in, ask how the others are doing. */}
      {linked.length > 0 && (
        <div className="linked-row">
          <span className="linked-lab">Same wreck</span>
          {linked.map((l: any) => (
            <a key={l.id} className="linked-chip" href={`/leads/${l.id}`}>{l.name}{l.lead_no ? ` (${l.lead_no})` : ""}</a>
          ))}
        </div>
      )}

      {/* WIP fix banner: QA sent this back. Resubmit returns it to the QA queue. */}
      {canTools && activeClaim?.claim_type !== "mva" && lead.wip_pending && <WipBanner lead={lead} claimId={activeClaim?.id} signed={/^signed_/.test(activeClaim?.status || "")} />}

      {/* Main grid */}
      <div className="lead-grid solo">
        <div className="card" style={{ padding: 0 }}>
          <div className="tabs">
            {navigation.map((g) => (
              <button key={g.label} className={group === g ? "active" : ""} onClick={() => { setTab(g.tabs[0]); setEditMode(false); }}>{g.label}</button>
            ))}
            {canEdit && (tab === "Contact Info" || tab === "Case Details") && (
              <button className={`edit-toggle ${editMode ? "on" : ""}`} onClick={() => setEditMode((v) => !v)} title={editMode ? "Done editing" : "Edit"} style={{ alignSelf: "center", marginRight: 8, marginLeft: "auto" }}>
                {editMode ? "✓ Done" : "✎ Edit"}
              </button>
            )}
          </div>
          {group && group.tabs.length > 1 && <div className="case-subnav" aria-label={group.label}>{group.tabs.map((t) => <button type="button" className={tab === t ? "active" : ""} key={t} onClick={() => { setTab(t); setEditMode(false); }}>{t === "Messages" ? "Texts & emails" : t === "Activity Log" ? "Audit table" : t}</button>)}</div>}
          <div className="formbody">
            {tab === "Overview" && (<>
              <CaseOverview lead={leadLive} activeClaim={activeClaim} signatureConfirmed={claims.length === 1 && !!lead.signed_at} notes={matterNotes} callLogs={callLogs} fence={fence} identified={identified} lor={lor} lastComm={lastComm} points={points} intakeAnswered={appCall?.answered} onGo={(t) => { setTab(t); setEditMode(false); }} />
              {/* Injured-party status and the pipeline live at the bottom of
                  Overview now; the old "File detail" fold bar is gone. */}
              <div style={{ marginTop: 18 }}><PncBanner lead={leadLive} readOnly={!canEdit} /></div>
              <div style={{ marginTop: 12 }}><PipelineStrip status={activeClaim?.status ?? lead.status ?? "new"} mva={activeClaim?.claim_type === "mva"} /></div>
            </>)}
            {tab === "Case Questions" && appCall && !showOldForm && (
              <AppAnswers call={appCall} onShowOld={appCall.hasOld ? () => setShowOldForm(true) : undefined} />
            )}
            {tab === "Case Questions" && activeClaim && (!appCall || showOldForm) && (
              <div>
                {appCall && <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setShowOldForm(false)}>Back to the App answers</button>}
                {canEdit && (
                  <div className="gate" style={{ marginBottom: 16 }}>
                    <span className="tag">Compliance notice</span>
                    Leading statements of any kind result in forfeiture of file credit and disciplinary
                    action. Ask every question in order and verbatim.
                  </div>
                )}
                <IntakeSurface
                  claimId={activeClaim.id}
                  firmId={lead.firm_id}
                  initialAnswers={activeClaim.answers ?? {}}
                  initialProperties={claimProperties[activeClaim.id] ?? []}
                  claimantName={lead.claimant_name ?? undefined}
                  claimantEmail={lead.email ?? undefined}
                  claimType={activeClaim.claim_type}
                  leadId={lead.id}
                  customFields={formsByClaim[activeClaim.id] ?? formsByType?.[activeClaim.claim_type]}
                  readOnly={!canEdit || !!appCall}
                />
              </div>
            )}
            {tab === "Case Questions" && !activeClaim && (
              <p className="muted">No intake on this file yet.</p>
            )}
            {tab === "Contact Info" && <ContactInfo lead={leadLive} claimType={activeClaim?.claim_type} editMode={canEdit && editMode} onRequestEdit={canEdit ? () => setEditMode(true) : undefined} points={points} onSaved={liveUp} />}
            {tab === "Case Details" && (
              <>
                <CaseDetails lead={leadLive} staff={staff} callAgent={appCall?.agent} callDisposition={appCall?.dispo} editMode={canEdit && editMode} onRequestEdit={canEdit ? () => setEditMode(true) : undefined} fence={fence} onSaved={liveUp} />
              </>
            )}
            {tab === "QA" && <QaPanel leadId={lead.id} claimId={activeClaim?.id} role={lead.current_user_role} signedDeclineAction={activeClaim?.claim_type === "mva" && activeClaim?.campaign === "INNO MVA"} fence={fence} claimStatus={activeClaim?.status} grievousVerdict={activeClaim?.grievous_verdict} />}
            {tab === "Retainer" && <><RetainerTab key={activeClaimId} leadId={lead.id} claimId={activeClaimId} role={lead.current_user_role} fence={fence} initialRetainers={retainers} initialSignables={signables} /><CaseDocuments key={`docs-${activeClaimId}`} leadId={lead.id} claimId={activeClaim?.id} /></>}
            {tab === "Messages" && <CommsTimeline leadId={lead.id} phone={leadLive.phone} channel="messages" fence={fence} />}
            {tab === "Calls" && <CommsTimeline leadId={lead.id} phone={leadLive.phone} channel="call" fence={fence} />}
            {tab === "Notes" && <NotesTab key={activeClaimId} leadId={lead.id} claimId={activeClaim?.id} initial={matterNotes} fence={fence} />}
            {tab === "Timeline" && <CaseTimeline entries={matterAudit} />}
            {tab === "Activity Log" && <ActivityLog entries={matterAudit} />}
          </div>
        </div>

        {canTools && <FloatingDock lead={leadLive} claimId={activeClaim?.id} claimType={activeClaim?.claim_type ?? "motel_trafficking"} />}
      </div>
    </div>
  );
}

function CampaignPicker({ leadId, current, role }: { leadId: string; current?: string | null; role?: string }) {
  const [open, setOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const canChange = role === "owner" || role === "admin";
  async function load() {
    try { const d = await (await fetch("/api/campaigns")).json(); setCampaigns((d.campaigns ?? []).filter((c: any) => c.active)); } catch {}
  }
  async function choose(id: string) {
    setBusy(true);
    const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "set_campaign", lead_id: leadId, campaign_id: id }) });
    const d = await r.json();
    setBusy(false);
    if (d.ok) window.location.reload();
  }
  if (!canChange) return <span className="leadhead-campaign" title="Campaign — the spine of this file">{current || "No campaign set"}</span>;
  return (
    <span className="campaign-picker">
      <button className="leadhead-campaign as-btn" title="Campaign is the spine of this file. Click to change." onClick={() => { if (!open) load(); setOpen(!open); }}>
        {current || "Set campaign"} ▾
      </button>
      {open && (
        <div className="campaign-menu" onMouseLeave={() => setOpen(false)}>
          <div className="campaign-menu-hint">Campaign drives intake, retainer, and e-sign. Changing it re-spines this file.</div>
          {campaigns.map((c) => (
            <button key={c.id} className="campaign-menu-item" disabled={busy} onClick={() => choose(c.id)}>{c.name}</button>
          ))}
          {campaigns.length === 0 && <div className="campaign-menu-hint">No active campaigns.</div>}
        </div>
      )}
    </span>
  );
}

function PipelineStrip({ status, mva = false }: { status: string; mva?: boolean }) {
  if (resolveFileStatus({ status }).phase === "terminal") return null;
  // Map any status to one of five pipeline stages.
  const stages = mva ? ["Intake", "Agreement", "Agent review", "Firm"] : ["Intake", "Grievous", "QA", "Approved", "Firm"];
  let active = 0;
  if (/grievous/.test(status)) active = 1;
  else if (/^(qa|signed_qa)$/.test(status)) active = 2;
  else if (/wip|flag/.test(status)) active = 2; // back in the QA loop
  else if (/approved/.test(status)) active = 3;
  else if (/delivered|retained|dropped|dq/.test(status)) active = 4;
  else active = 0;
  if (mva) active = /delivered|retained/.test(status) ? 3 : /signed|approved/.test(status) ? 2 : /esign/.test(status) ? 1 : 0;
  return (
    <div className="pipeline-strip">
      {stages.map((s, i) => (
        <div key={s} className={`pipe-step ${i < active ? "done" : ""} ${i === active ? "on" : ""}`}>
          <span className="pipe-dot" />
          <span className="pipe-label">{s}</span>
          {i < stages.length - 1 && <span className="pipe-bar" />}
        </div>
      ))}
    </div>
  );
}

function WipBanner({ lead, claimId, signed }: { lead: any; claimId?: string; signed: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function resubmit() {
    setBusy(true);
    const status = signed ? "signed_qa" : "qa";
    // Resubmit the MATTER being fixed, not the whole person: a sibling claim
    // on another campaign stays where it is (Astra round 5).
    const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "status", lead_id: lead.id, claim_id: claimId || undefined, status }) });
    setBusy(false);
    if (r.ok) { setDone(true); setTimeout(() => window.location.reload(), 700); }
  }
  return (
    <div className="wip-banner">
      <div>
        <strong>QA sent this back for a fix.</strong>
        <span className="muted" style={{ marginLeft: 8 }}>Correct what was flagged (check the QA tab and internal thread), then resubmit so QA can re-review.</span>
      </div>
      <button className="btn" disabled={busy || done} onClick={resubmit}>{done ? "Resubmitted" : busy ? "Resubmitting…" : "Resubmit to QA"}</button>
    </div>
  );
}

function PncBanner({ lead, readOnly = false }: { lead: any; readOnly?: boolean }) {
  const [state, setState] = useState<string>(lead.pnc_status ?? "speaking_with_ip");
  const [saving, setSaving] = useState(false);

  const STATES = [
    { id: "speaking_with_ip", label: "Speaking with IP" },
    { id: "deceased_ip", label: "Deceased IP" },
    { id: "minor_ip", label: "Minor IP" },
  ];

  async function pick(s: string) {
    setState(s); setSaving(true);
    await fetch("/api/leads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", lead_id: lead.id, lead: { pnc_status: s } }),
    }).catch(() => {});
    setSaving(false);
  }

  const note = state === "speaking_with_ip"
    ? "Speaking with the injured party. They sign for themselves, no OBO needed."
    : state === "deceased_ip"
    ? "Injured party is deceased. Speak only with the OBO (surviving spouse/executor) who has legal authority and signs the retainer."
    : "Injured party is a minor. Speak only with the parent/guardian (OBO) who signs the retainer.";

  return (
    <div className={state === "speaking_with_ip" ? "pnc" : "pnc warn"}>
      <div className="pncbadge">{state === "speaking_with_ip" ? "✓" : "!"}</div>
      <div style={{ flex: 1 }}>
        <strong>Injured Party: {lead.claimant_name ?? "—"}</strong>
        <div className="muted">{note}</div>
      </div>
      {!readOnly && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {STATES.map((s) => (
            <button key={s.id} className={`chip ${state === s.id ? "active" : ""}`}
              disabled={saving} onClick={() => pick(s.id)}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateClaim({ leadId, firmId }: { leadId: string; firmId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [types, setTypes] = useState<{ value: string; label: string; campaign?: string }[]>([]);

  useEffect(() => { (async () => {
    try { const r = await fetch("/api/claim-types"); const d = await r.json(); setTypes(d.types ?? []); } catch {}
  })(); }, []);

  async function create(type: string, campaign?: string, dupReason?: string) {
    setBusy(true);
    const r = await fetch("/api/claims", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "create", lead_id: leadId, firm_id: firmId, claim_type: type, campaign: campaign || null, dup_override_reason: dupReason || null }),
    });
    const d = await r.json().catch(() => ({}));
    // Same-case-type dedup: agent must justify before we allow it.
    if (r.ok && d.needs_override) {
      setBusy(false);
      const reason = window.prompt(`${d.message}\n\nWhy is this PNC getting another intake for the same case type? What is unique about this claim vs the existing one? (required)`);
      if (!reason || !reason.trim()) return; // cancelled, no override
      return create(type, campaign, reason.trim());
    }
    if (r.ok && d.id) { location.reload(); return; }
    setBusy(false);
    alert(`Could not create claim: ${d.error || r.status}`);
  }

  if (!open) {
    return <button className="claimchip subtle" onClick={() => setOpen(true)} title="Use this when the same person has a second, separate matter (e.g. a different mass tort)">+ Add another claim</button>;
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {types.map((t) => (
        <button key={t.value} className="chip" disabled={busy} onClick={() => create(t.value, t.campaign)}>{t.label}</button>
      ))}
      <button className="chip" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
}

function LockFileButton({ lead }: { lead: any }) {
  const [locked, setLocked] = useState(!!lead.is_locked);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", lead_id: lead.id, lead: { is_locked: !locked } }) });
    setBusy(false);
    if (r.ok) setLocked(!locked); else { const d = await r.json().catch(() => ({})); alert(`Lock failed: ${d.error || r.status}`); }
  }
  return (
    <button className={`cl-btn cl-sm ${locked ? "" : "cl-ghost"}`} onClick={toggle} disabled={busy} title={locked ? "File is locked, click to unlock" : "Lock this file read-only"}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {locked
          ? <><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></>
          : <><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>}
      </svg>
      {locked ? "Unlock file" : "Lock file"}
    </button>
  );
}

// Sends the matter this screen is showing (the active claim tab), never the
// whole person: each matter has its own sent state (Astra round 7b #57).
function SendToFirmButton({ leadId, claimId }: { leadId: string; claimId?: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ sentAt: string | null; result: string | null }>({ sentAt: null, result: null });
  const [delivery, setDelivery] = useState<any>(null);
  const [dispatch, setDispatch] = useState<any>(null);
  const [canReconcile, setCanReconcile] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const q = `lead_id=${encodeURIComponent(leadId)}${claimId ? `&claim_id=${encodeURIComponent(claimId)}` : ""}`;

  useEffect(() => {
    let alive = true;
    setState({ sentAt: null, result: null }); setMsg(""); setLoaded(false);
    (async () => {
      try {
        const r = await fetch(`/api/firm-delivery?${q}`);
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || "Delivery status could not load.");
        if (alive) { setState({ sentAt: d.firm_sent_at ?? null, result: d.firm_send_result ?? null }); setDelivery(d.delivery); setDispatch(d.dispatch); setCanReconcile(!!d.can_reconcile); setLoaded(true); }
      } catch (e: any) { if (alive) setMsg(e.message); }
    })();
    return () => { alive = false; };
  }, [q]);

  async function send(force: boolean) {
    const already = !!state.sentAt;
    const to = String(delivery?.to || "").trim();
    const cc = Array.isArray(delivery?.cc) ? delivery.cc : String(delivery?.cc || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    if (!to) { setMsg("No firm recipient is configured. Nothing was sent."); return; }
    if (!confirm(`Are you sure you want to ${already ? "RESEND" : "send"} this matter's packet?\n\nIt will deliver to: ${to}${cc.length ? `\nCC: ${cc.join(", ")}` : ""}\n\nFirm: ${delivery?.firm || "configured firm"}`)) return;
    if (already) force = true;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/firm-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: leadId, claim_id: claimId || undefined, force, expected_to: to, expected_cc: cc }) });
      const d = await r.json();
      setBusy(false);
      if (!r.ok || !d.ok) { setMsg(d.error || d.skipped || "Send failed"); try { const state = await (await fetch(`/api/firm-delivery?${q}`)).json(); setDispatch(state.dispatch); } catch {} return; }
      if (d.skipped) { setMsg(d.skipped); return; }
      setState({ sentAt: new Date().toISOString(), result: "sent" });
      const n = (d.attachments || []).length;
      setMsg(`Sent to ${d.to || "firm"} (${n} attachment${n === 1 ? "" : "s"})${d.warning ? `. ${d.warning}` : ""}`);
      router.refresh();
    } catch (e: any) { setBusy(false); setMsg(e?.message || "Send error"); }
  }
  async function reconcile(delivered: boolean) {
    const note = window.prompt(`Record this attempt as ${delivered ? "delivered" : "NOT delivered"}. Check the email provider's delivery log first. Describe the evidence (at least 10 characters). This does not send an email.`);
    if (!note || note.trim().length < 10) return;
    setBusy(true);
    try {
      const r = await fetch("/api/firm-delivery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "reconcile", lead_id: leadId, claim_id: claimId, attempt_key: dispatch?.attempt_key, delivered, note: note.trim() }) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Reconciliation failed.");
      const fresh = await (await fetch(`/api/firm-delivery?${q}`)).json();
      setDispatch(fresh.dispatch); setState({ sentAt: fresh.firm_sent_at, result: fresh.firm_send_result }); setMsg(d.message);
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  }
  const unresolved = ["sending", "uncertain"].includes(dispatch?.state);

  const label = busy ? "Sending…" : state.sentAt ? "Already sent to firm" : "Send signed packet to firm";
  return (
    <span className="lf-send-action">
      <button className="cl-btn lf-primary-action lf-send-button" onClick={() => send(false)} disabled={busy || !loaded || unresolved || !!state.sentAt}
        title={state.sentAt ? `Already sent ${new Date(state.sentAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "short" })}` : "Email the firm this matter's documents"}>
        {label}
      </button>
      {unresolved && <span className="muted" role="status">Delivery outcome needs review.{canReconcile && <><button type="button" className="cl-btn cl-sm" disabled={busy} onClick={() => void reconcile(true)}>Record delivered</button><button type="button" className="cl-btn cl-sm" disabled={busy} onClick={() => void reconcile(false)}>Record not delivered</button></>}</span>}
      {msg && <span className="lf-send-message" role="status">{msg}</span>}
    </span>
  );
}


// Case Questions for a file worked in the App: the App's answers, read only,
// with a way into the App to keep going. Same rows as the printed case.
function AppAnswers({ call, onShowOld }: {
  call: { rows: { k: string; v: string }[]; answered: number; href: string; when: string | null; agent: string | null; dispo: string | null };
  onShowOld?: () => void;
}) {
  const when = call.when ? new Date(call.when).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : null;
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600 }}>Intake answers</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {call.answered ? `${call.answered} answers` : "Nothing answered yet"}{when ? `, last saved ${when}` : ""}{call.agent ? ` by ${call.agent}` : ""}{call.dispo ? `. Dispo: ${call.dispo}` : ""}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {onShowOld && <button className="btn ghost sm" onClick={onShowOld}>Earlier intake answers · read only</button>}
          <a className="btn sm" href={call.href}>Resume intake</a>
        </div>
      </div>
      {call.rows.length === 0 ? (
        <p className="muted">No intake answers on this matter yet. Start the intake to capture them.</p>
      ) : (
        <table className="docket" style={{ width: "100%" }}>
          <tbody>
            {call.rows.map((r, i) => (
              <tr key={`${r.k}-${i}`}><td className="muted" style={{ width: 200, verticalAlign: "top" }}>{r.k}</td><td style={{ fontWeight: 500 }}>{r.v}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
