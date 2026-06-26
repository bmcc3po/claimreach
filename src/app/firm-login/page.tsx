"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function FirmLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendLink() {
    setBusy(true); setErr(null);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/portal` },
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSent(true);
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="brand" style={{ fontWeight: 700, fontSize: 20, marginBottom: 2 }}>
          ClaimReach <small className="muted">Firm Portal</small>
        </div>
        {sent ? (
          <p>Check your email for a secure sign-in link. You can close this tab.</p>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Enter your firm email and we'll send a one-time sign-in link.
            </p>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendLink()} />
            </div>
            {err && <p style={{ color: "var(--danger)", fontSize: 13 }}>{err}</p>}
            <button className="btn" style={{ width: "100%" }} disabled={busy} onClick={sendLink}>
              {busy ? "Sending…" : "Send sign-in link"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
