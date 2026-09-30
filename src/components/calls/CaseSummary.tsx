"use client";

import { useId, useMemo, useState } from "react";
import { caseReport } from "@/lib/mva-call/report";

export default function CaseSummary({ answerSnapshot, claimantName, saveBad = false }: {
  /** The same SSN-free engine snapshot used by autosave. */
  answerSnapshot: string;
  claimantName: string;
  saveBad?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const { paragraphs, notes } = useMemo(() => {
    const answers = JSON.parse(answerSnapshot);
    return {
      paragraphs: caseReport({ claimant_name: claimantName }, answers, undefined, { includeAgreement: false }).summary,
      notes: String(answers?.story?.text || "").trim(),
    };
  }, [answerSnapshot, claimantName]);
  const preview = paragraphs[0] || notes;
  const canExpand = paragraphs.length > 1 || (paragraphs.length > 0 && !!notes) || preview.length > 180;
  return <section className="cc-card" aria-label="Case summary">
    <div className="cc-card-h">Case summary</div>
    <div className="cc-cue" style={{ margin: "4px 0 10px" }}>Based on intake answers{saveBad ? " · Changes not saved yet" : ""}</div>
    <div id={contentId}>
      {!preview ? <p className="cc-cue" style={{ margin: 0 }}>No intake answers captured yet.</p> : expanded ? <>
        {paragraphs.map((paragraph, index) => <p key={index} style={{ margin: "0 0 10px", lineHeight: 1.5 }}>{paragraph}</p>)}
        {!!notes && <div><strong className="cc-cue">Intake notes</strong><p style={{ margin: "4px 0 0", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{notes}</p></div>}
      </> : <>
        {!paragraphs.length && <strong className="cc-cue">Intake notes</strong>}
        <p style={{ margin: 0, lineHeight: 1.5, ...(canExpand ? { display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 3, overflow: "hidden" } : {}) }}>{preview}</p>
      </>}
    </div>
    {canExpand && <button type="button" className="cc-chip cc-sm" style={{ marginTop: 10 }} aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded((open) => !open)}>{expanded ? "Less" : "Full summary"}</button>}
  </section>;
}
