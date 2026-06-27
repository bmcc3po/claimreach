"use client";
import { useState } from "react";
import { SEVERITY_LETTERS, EVIDENCE_NUMBERS, SEVERITY_DESC, EVIDENCE_DESC, isTrafficking, tierLabel } from "@/lib/tiers";

export default function TierEditor({ claimId, claimType, letter, number }: {
  claimId: string; claimType?: string; letter?: string | null; number?: number | null;
}) {
  const traffick = isTrafficking(claimType);
  const [l, setL] = useState<string | null>(letter ?? null);
  const [n, setN] = useState<number | null>(number ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    await fetch("/api/tier", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_id: claimId, tier_letter: traffick ? l : null, tier_number: n, tier: tierLabel(l, n, claimType) }),
    }).catch(() => {});
    setSaving(false); setSaved(true);
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row" style={{ marginBottom: 10 }}><h3 style={{ margin: 0 }}>Case tier</h3>
        <span className="spacer" /><span className="badge gold" style={{ fontWeight: 800 }}>{tierLabel(l, n, claimType)}</span>
      </div>
      {traffick && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 6 }}>Severity (A worst → F least)</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SEVERITY_LETTERS.map((x) => (
              <button key={x} className={`chip ${l === x ? "active" : ""}`} onClick={() => setL(x)} title={SEVERITY_DESC[x]}>{x}</button>
            ))}
          </div>
          {l && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{SEVERITY_DESC[l]}</p>}
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 6 }}>{traffick ? "Motel knowledge (1 strongest → 5 generic)" : "Case strength (1 strongest → 5 weak)"}</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {EVIDENCE_NUMBERS.map((x) => (
            <button key={x} className={`chip ${n === x ? "active" : ""}`} onClick={() => setN(x)} title={EVIDENCE_DESC[x]}>{x}</button>
          ))}
        </div>
        {n && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{EVIDENCE_DESC[n]}</p>}
      </div>
      <button className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : saved ? "Saved ✓" : "Save tier"}</button>
    </div>
  );
}
