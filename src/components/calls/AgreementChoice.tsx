"use client";

/** One draft contract control for every intake view and the phone file panel. */
export default function AgreementChoice({ v }: { v: any }) {
  const choice = v.contractChoice;
  if (!choice) return null;
  return <div className="cc-agreement-choice">
    <label><span className="cc-lab">Agreement contract</span>
      <select className="cc-field" aria-label="Agreement contract" value={choice.key || ""} disabled={choice.locked || !choice.options.length} onChange={(e) => choice.select(e.target.value)}>
        {!choice.key && <option value="">Add the wreck location first</option>}
        {choice.options.map((option: any) => <option key={option.key} value={option.key} disabled={!option.available}>{option.label}{option.available ? "" : " — not configured"}</option>)}
      </select>
    </label>
    {!!choice.error && <div className="cc-cue cc-red" role="status">{choice.error}</div>}
    {choice.requiresReason && <label><span className="cc-lab">Who approved the non-tiered agreement?</span>
      <input className="cc-field" type="text" maxLength={300} placeholder='e.g. "Brett approved, friend and family"' aria-label="Non-tiered approval reason" value={choice.reason.value ?? ""} disabled={choice.locked} onChange={choice.reason.set} />
      <span className={`cc-cue${choice.needReason ? " cc-red" : ""}`}>{choice.needReason ? "Add the approval reason before sending. It is recorded on the file." : "Recorded on the file with the send."}</span>
    </label>}
  </div>;
}
