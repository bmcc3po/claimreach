"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function NewIntake() {
  const router = useRouter();
  const [firmRef, setFirmRef] = useState("");
  const [lrRef, setLrRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setBusy(true); setErr(null);
    try {
      // resolve current user's firm? Internal staff run intake for the TMP firm.
      // Look up TMP firm id via a lightweight query.
      const sb = supabaseBrowser();
      const { data: firm } = await sb.from("firms").select("id").eq("slug", "tmp").maybeSingle();
      if (!firm) throw new Error("TMP firm not found — seed the firms table");

      const r = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "create", firm_id: firm.id,
          firm_ref_no: firmRef || null, lawruler_ref_no: lrRef || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "could not create lead");
      router.push(`/intake/${d.lead.id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <h2>New intake</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Referral cases come in pre-signed. Enter any reference numbers if you have them; a
          ClaimReach lead number is assigned automatically.
        </p>
        <div className="field">
          <label>Firm reference # (TMP docket, optional)</label>
          <input type="text" value={firmRef} onChange={(e) => setFirmRef(e.target.value)} />
        </div>
        <div className="field">
          <label>LawRuler # (optional, if carried over)</label>
          <input type="text" value={lrRef} onChange={(e) => setLrRef(e.target.value)} />
        </div>
        {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
        <button className="btn" onClick={start} disabled={busy}>
          {busy ? "Creating…" : "Start intake"}
        </button>
      </div>
    </div>
  );
}
