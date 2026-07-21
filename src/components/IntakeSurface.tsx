"use client";
import { useState, useEffect } from "react";
import GuidedIntake from "@/components/GuidedIntake";
import ClaimIntake from "@/components/ClaimIntake";
import type { Field } from "@/lib/questionnaire";

// ============================================================================
// Guided is the default surface for EVERY case type: one bold question at a
// time, in order, telling the agent exactly what to do next.
//
// The section view ("All sections" — the whole intake at once) stays reachable,
// but only for users a manager/admin has trusted with it. Everyone else is held
// in guided, which is the right tool for a live call. The gate is the per-user
// `intake.full` permission (Users screen); we read it once on mount so a plain
// agent never even sees the switch.
// ============================================================================

export default function IntakeSurface(props: {
  claimId: string; firmId: string; leadId: string;
  claimType?: string; customFields?: Field[] | null;
  initialAnswers?: Record<string, any>;
  initialProperties?: any[];
  claimantName?: string; claimantEmail?: string;
}) {
  const [mode, setMode] = useState<"guided" | "sections">("guided");
  const [allowFull, setAllowFull] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/console?me=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.can_full_intake) setAllowFull(true); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Without the permission the agent is held in guided no matter what.
  const view = allowFull ? mode : "guided";

  return (
    <div>
      <div className="row" style={{ marginBottom: 12, gap: 8 }}>
        {allowFull && (
          <div className="seg">
            <button className={view === "guided" ? "on" : ""} onClick={() => setMode("guided")}>Guided</button>
            <button className={view === "sections" ? "on" : ""} onClick={() => setMode("sections")}>All sections</button>
          </div>
        )}
        <span className="muted" style={{ fontSize: 12 }}>
          {view === "guided" ? "One question at a time, in order." : "Review view. Use guided when you are on a call."}
        </span>
        <style>{`
          .seg { display:inline-flex; border:1px solid var(--line); border-radius:9px; overflow:hidden; }
          .seg button { border:0; background:var(--surface); font:inherit; font-size:13px; font-weight:700;
            padding:8px 14px; cursor:pointer; color:var(--ink-soft); }
          .seg button.on { background:#0f1a2a; color:#fff; }
        `}</style>
      </div>

      {view === "guided" ? (
        <GuidedIntake
          claimId={props.claimId}
          firmId={props.firmId}
          leadId={props.leadId}
          claimType={props.claimType}
          customFields={props.customFields}
          initialAnswers={props.initialAnswers}
          initialProperties={props.initialProperties as any}
          claimantName={props.claimantName}
          onExit={() => { window.location.href = `/leads/${props.leadId}`; }}
        />
      ) : (
        <ClaimIntake
          claimId={props.claimId}
          firmId={props.firmId}
          initialAnswers={props.initialAnswers ?? {}}
          initialProperties={(props.initialProperties ?? []) as any}
          claimantName={props.claimantName}
          claimantEmail={props.claimantEmail}
          claimType={props.claimType}
          leadId={props.leadId}
          customFields={props.customFields as any}
        />
      )}
    </div>
  );
}
