"use client";
import { useState } from "react";
import GuidedIntake from "@/components/GuidedIntake";
import ClaimIntake from "@/components/ClaimIntake";
import type { Field } from "@/lib/questionnaire";

// ============================================================================
// Guided is the default surface for every case type: one bold question at a
// time, in order, telling the agent exactly what to do next.
//
// The section view stays reachable rather than deleted. It is the right tool for
// a QA pass or a supervisor auditing a finished file, where you genuinely do
// want to jump straight to one answer. It is the wrong tool for running a live
// call, which is why it is no longer what opens.
// ============================================================================

export default function IntakeSurface(props: {
  claimId: string; firmId: string; leadId: string;
  claimType?: string; customFields?: Field[] | null;
  initialAnswers?: Record<string, any>;
  initialProperties?: any[];
  claimantName?: string; claimantEmail?: string;
}) {
  const [mode, setMode] = useState<"guided" | "sections">("guided");

  return (
    <div>
      <div className="row" style={{ marginBottom: 12, gap: 8 }}>
        <div className="seg">
          <button className={mode === "guided" ? "on" : ""} onClick={() => setMode("guided")}>Guided</button>
          <button className={mode === "sections" ? "on" : ""} onClick={() => setMode("sections")}>All sections</button>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {mode === "guided" ? "One question at a time, in order." : "Review view. Use guided when you are on a call."}
        </span>
        <style>{`
          .seg { display:inline-flex; border:1px solid var(--line); border-radius:9px; overflow:hidden; }
          .seg button { border:0; background:var(--surface); font:inherit; font-size:13px; font-weight:700;
            padding:8px 14px; cursor:pointer; color:var(--ink-soft); }
          .seg button.on { background:#0f1a2a; color:#fff; }
        `}</style>
      </div>

      {mode === "guided" ? (
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
