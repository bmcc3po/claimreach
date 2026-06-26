"use client";
export const runtime = "edge";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

const CASE_TYPES = [
  { value: "motel_trafficking", label: "Motel Trafficking" },
  // MedMal / MVA added here when those case types go live
];

export default function AddLead() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [firmRef, setFirmRef] = useState("");
  const [lrRef, setLrRef] = useState("");
  const [caseType, setCaseType] = useState("motel_trafficking");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(thenIntake: boolean) {
    setBusy(true); setErr(null);
    try {
      const sb = supabaseBrowser();
      const { data: firm } = await sb.from("firms").select("id").eq("slug", "tmp").maybeSingle();
      if (!firm) throw new Error("TMP firm not found");

      const r = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "create",
          firm_id: firm.id,
          case_type: caseType,
          claimant_name: name || null,
          phone: phone || null,
          email: email || null,
          firm_ref_no: firmRef || null,
          lawruler_ref_no: lrRef || null,
          stage: thenIntake ? "intake_in_progress" : "referral_received",
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "could not create lead");
      router.push(thenIntake ? `/intake/${d.lead.id}` : "/leads");
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h2>Add lead</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Quick-add a referral. Fill the basics now; the full intake captures the rest. A ClaimReach
          lead number is assigned automatically.
        </p>

        <div className="field">
          <label>Case type</label>
          <select value={caseType} onChange={(e) => setCaseType(e.target.value)}>
            {CASE_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Claimant name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Phone</label>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>TMP reference #</label>
            <input type="text" value={firmRef} onChange={(e) => setFirmRef(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>LawRuler # (optional)</label>
            <input type="text" value={lrRef} onChange={(e) => setLrRef(e.target.value)} />
          </div>
        </div>

        {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" disabled={busy} onClick={() => create(false)}>
            {busy ? "Saving…" : "Save lead"}
          </button>
          <button className="btn secondary" disabled={busy} onClick={() => create(true)}>
            Save &amp; start intake
          </button>
        </div>
      </div>
    </div>
  );
}
