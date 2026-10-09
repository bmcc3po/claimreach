"use client";
export const runtime = "edge";

import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Logo } from "@/components/Logo";

export default function PartnerLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  async function sendLink() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError(null);
    try {
      const { error: signInError } = await supabaseBrowser().auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fpartner`,
        },
      });
      if (signInError) {
        setError("Could not send a sign-in link. Check the address with ClaimReach and try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Could not confirm the sign-in link. Check your email before trying again.");
    } finally { pending.current = false; setBusy(false); }
  }

  return <div className="login-wrap"><div className="card login-card">
    <div style={{ marginBottom: 16 }}><Logo height={34} /></div>
    <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Partner reporting</h1>
    {sent ? <p className="muted" role="status">If this address has partner access, a sign-in link is on its way.</p> : <>
      <p className="muted">Enter the approved email for a one-time sign-in link.</p>
      <form onSubmit={e => { e.preventDefault(); void sendLink(); }}>
      <div className="field"><label htmlFor="partner-email">Email</label>
        <input id="partner-email" type="email" autoComplete="username" required disabled={busy} value={email}
          onChange={e => setEmail(e.target.value)} /></div>
      {error && <p className="login-err" role="alert">{error}</p>}
      <button type="submit" className="btn" style={{ width: "100%" }} disabled={busy || !email.trim()}>
        {busy ? "Sending…" : "Send sign-in link"}
      </button>
      </form>
    </>}
  </div></div>;
}
