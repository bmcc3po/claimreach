"use client";
import { useRef, useState } from "react";
import { SEVERITY_LETTERS, EVIDENCE_NUMBERS, SEVERITY_DESC, EVIDENCE_DESC, isTrafficking, tierLabel } from "@/lib/tiers";

export default function TierEditor({ claimId, claimType, letter, number }: {
  claimId: string; claimType?: string; letter?: string | null; number?: number | null;
}) {
  const traffick = isTrafficking(claimType);
  const [l, setL] = useState<string | null>(letter ?? null);
  const [n, setN] = useState<number | null>(number ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaved(false); setError("");
    try {
      const r = await fetch("/api/tier", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim_id: claimId, tier_letter: traffick ? l : null, tier_number: n, tier: tierLabel(l, n, claimType) }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || data?.ok !== true) { setError(data?.error || "The tier was not saved. Your selection is still here."); return; }
      setSaved(true);
    } catch { setError("Could not connect. Your tier selection is still here. Please retry."); }
    finally { inFlight.current = false; setSaving(false); }
  }

  return (
    <fieldset className="card" disabled={saving} style={{ padding: 16, minWidth: 0, margin: 0 }}>
      <div className="row" style={{ marginBottom: 10 }}><h3 style={{ margin: 0 }}>Case tier</h3>
        <span className="spacer" /><span className="badge gold" style={{ fontWeight: 800 }}>{tierLabel(l, n, claimType)}</span>
      </div>
      {traffick && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 6 }}>Severity (A worst → F least)</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SEVERITY_LETTERS.map((x) => (
              <button key={x} className={`chip ${l === x ? "active" : ""}`} aria-pressed={l === x} onClick={() => { setL(x); setSaved(false); setError(""); }} title={SEVERITY_DESC[x]}>{x}</button>
            ))}
          </div>
          {l && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{SEVERITY_DESC[l]}</p>}
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 6 }}>{traffick ? "Motel knowledge (1 strongest → 5 generic)" : "Case strength (1 strongest → 5 weak)"}</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {EVIDENCE_NUMBERS.map((x) => (
            <button key={x} className={`chip ${n === x ? "active" : ""}`} aria-pressed={n === x} onClick={() => { setN(x); setSaved(false); setError(""); }} title={EVIDENCE_DESC[x]}>{x}</button>
          ))}
        </div>
        {n && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{EVIDENCE_DESC[n]}</p>}
      </div>
      <button className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : saved ? "Saved ✓" : "Save tier"}</button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
