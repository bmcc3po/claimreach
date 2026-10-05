"use client";

import { storySuggestionText, type StorySuggestion } from "@/lib/mva-call/story-assist";

export default function StoryAssist({ helper, notes }: { helper: any; notes: string }) {
  if (!helper) return null;
  const count = helper.applyCount ?? helper.plan?.chosen.length ?? 0;
  return <div className="iq-story-assist">
    <button type="button" className="fi-add" disabled={helper.busy || notes.trim().length < 10} onClick={helper.suggest}>
      {helper.busy ? "Working…" : "Fill from story"}
    </button>
    {!helper.plan && !helper.message && !helper.error && <small>Suggest answers from these notes. You choose what to use.</small>}
    {!!helper.error && <p role="alert" className="iq-warning">{helper.error}</p>}
    {!!helper.message && <p role="status">{helper.message}</p>}
    {helper.plan && <div className="iq-story-review">
      <strong>Check these answers</strong>
      <p>Uncheck anything that is not right. Existing answers stay as entered.</p>
      {helper.stale && <p role="alert" className="iq-warning">Your notes changed. Use Fill from story again.</p>}
      {helper.plan.rows.map((row: StorySuggestion) => <label key={row.id} className="iq-story-answer">
        <input type="checkbox" checked={helper.plan.chosen.includes(row.id)} disabled={helper.busy || helper.stale} onChange={() => helper.toggle(row.id)} />
        <span><strong>{row.label}</strong><span>{storySuggestionText(row.value)}</span><small>From your notes: “{row.evidence}”</small></span>
      </label>)}
      <div className="iq-story-actions">
        <button type="button" className="fi-add" onClick={helper.apply} disabled={helper.busy || helper.stale || count === 0}>Use {count} {count === 1 ? "answer" : "answers"}</button>
        <button type="button" className="fi-add" onClick={helper.dismiss} disabled={helper.busy}>Keep notes only</button>
      </div>
    </div>}
  </div>;
}
