"use client";
export const runtime = "edge";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Logo } from "@/components/Logo";

export default function PartnerLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink() {
    setBusy(true); setError(null);
    const { error: signInError } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fpartner`,
      },
    });
    setBusy(false);
    if (signInError) {
      setError("Could not send a sign-in link. Check the address with ClaimReach and try again.");
      return;
    }
    setSent(true);
  }

  return <div className="login-wrap"><div className="card login-card">
    <div style={{ marginBottom: 16 }}><Logo height={34} /></div>
    <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Partner reporting</h1>
    {sent ? <p className="muted">If this address has partner access, a sign-in link is on its way.</p> : <>
      <p className="muted">Enter the approved email for a one-time sign-in link.</p>
      <div className="field"><label htmlFor="partner-email">Email</label>
        <input id="partner-email" type="email" autoComplete="username" value={email}
          onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && sendLink()} /></div>
      {error && <p className="login-err">{error}</p>}
      <button className="btn" style={{ width: "100%" }} disabled={busy || !email.trim()} onClick={sendLink}>
        {busy ? "Sending…" : "Send sign-in link"}
      </button>
    </>}
  </div></div>;
}
