"use client";
import { useState } from "react";
import { passwordProblem } from "@/lib/password-rules";
import "@/components/calls/calls.css";

// First sign-in. The starter password was name plus 123, so everyone picks
// their own before they can see a single file.
export default function SetPassword() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const bad = passwordProblem(pw, null);
    if (bad) { setErr(bad); return; }
    if (pw !== pw2) { setErr("Those two don't match."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/me/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error || "That did not save.");
      window.location.href = "/dashboard";
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="cc-page">
      <div className="cc-app" style={{ justifyContent: "flex-start" }}>
        <main className="cc-main" style={{ paddingTop: "calc(40px + env(safe-area-inset-top))" }}>
          <div>
            <div className="cc-home-hi">Pick your password</div>
            <div className="cc-home-sub">Your starter password only works once. Make one that's yours, at least 10 characters.</div>
          </div>
          <input className="cc-field" type="password" autoComplete="new-password" placeholder="New password" aria-label="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <input className="cc-field" type="password" autoComplete="new-password" placeholder="Type it again" aria-label="Type it again" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          {err && <div className="cc-cue cc-red" style={{ marginTop: 0 }}>{err}</div>}
          <button className="cc-btn cc-full" disabled={busy || !pw || !pw2} onClick={save}>{busy ? "Saving" : "Save and continue"}</button>
        </main>
      </div>
    </div>
  );
}
