"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import FieldRenderer from "@/components/FieldRenderer";
import { fieldVisible, type Field } from "@/lib/questionnaire";
import { pfsAskable, pfsProgress } from "@/lib/pfs";

export default function PfsFill({
  leadId, leadName, leadNo, claimId, fields, initialAnswers,
}: {
  leadId: string;
  leadName: string;
  leadNo: string;
  claimId: string | null;
  fields: Field[];
  initialAnswers: Record<string, any>;
}) {
  const askable = useMemo(() => pfsAskable(fields), [fields]);
  const [answers, setAnswers] = useState<Record<string, any>>(initialAnswers);
  const [idx, setIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visible = useMemo(
    () => askable.filter((f) => fieldVisible(f, answers)),
    [askable, answers],
  );
  const field = visible[Math.min(idx, Math.max(visible.length - 1, 0))];
  const progress = pfsProgress(fields, answers);

  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  async function persist(next: Record<string, any>, loud = false) {
    if (!claimId) { setErr("This file has no claim yet."); return; }
    if (loud) setSaving(true);
    setErr("");
    try {
      const r = await fetch("/api/m6/pfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "save", lead_id: leadId, answers: next }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { setErr(d.error || "That did not save."); return; }
    } catch {
      setErr("That did not save. Check your connection.");
    } finally {
      if (loud) setSaving(false);
    }
  }

  function setAnswer(id: string, v: any) {
    const next = { ...answers, [id]: v };
    setAnswers(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void persist(next); }, 500);
  }

  if (!claimId) {
    return (
      <section className="m6-card">
        <p>This file has no claim yet, so there is nowhere to save answers.</p>
        <Link href={`/m6/cases/${leadId}`}>Back to the file</Link>
      </section>
    );
  }

  if (!field) {
    return (
      <section className="m6-card">
        <p>This questionnaire has no questions to fill in.</p>
      </section>
    );
  }

  return (
    <div className="m6-page">
      <div className="m6-head">
        <Link href={`/m6/cases/${leadId}`} className="m6-back">File</Link>
        <h1>Questionnaire</h1>
        <p className="m6-sub">{leadName} · {leadNo} · {progress.answered} of {progress.asked} answered</p>
      </div>
      <section className="m6-card">
        <p className="m6-hint">Question {Math.min(idx + 1, visible.length)} of {visible.length}</p>
        <FieldRenderer
          field={field}
          value={answers[field.id]}
          answers={answers}
          qNum={idx + 1}
          onChange={(v) => setAnswer(field.id, v)}
          onSetField={setAnswer}
        />
        {err && <p className="m6-error">{err}</p>}
        <div className="m6-modal-acts" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="m6-btn"
            disabled={idx === 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
          >
            Back
          </button>
          <button
            type="button"
            className="m6-btn primary"
            disabled={saving}
            onClick={async () => {
              await persist(answers, true);
              if (idx < visible.length - 1) setIdx((i) => i + 1);
            }}
          >
            {saving ? "Saving" : idx < visible.length - 1 ? "Next" : "Save"}
          </button>
          <a className="m6-btn" href={`/api/m6/pfs?export=1&lead_id=${encodeURIComponent(leadId)}`}>
            Download this file
          </a>
        </div>
      </section>
    </div>
  );
}
