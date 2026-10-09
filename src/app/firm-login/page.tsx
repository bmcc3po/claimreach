"use client";
export const runtime = "edge";
import { useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { isSafeFirmNext } from "@/lib/m6";

function quietLinkError(raw: string) {
  const m = (raw || "").toLowerCase();
  if (m.includes("rate") || m.includes("too many")) return "Too many attempts. Wait a moment and try again.";
  return "Couldn’t send a sign-in link. Try again.";
}

export default function FirmLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  async function sendLink() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setErr(null);
    try {
      const sb = supabaseBrowser();
      const params = new URLSearchParams(window.location.search);
      const next = isSafeFirmNext(params.get("next")) ?? "/portal";
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) { setErr(quietLinkError(error.message)); return; }
      setSent(true);
    } catch {
      setErr("Couldn’t confirm the sign-in link. Check your email before trying again.");
    } finally { pending.current = false; setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <Logo height={34} />
          <ThemeToggle />
        </div>
        <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Firm portal</h1>
        {sent ? (
          <p className="muted" role="status">Check your email for a secure sign-in link. You can close this tab.</p>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Enter your firm email and we’ll send a one-time sign-in link.
            </p>
            <form onSubmit={e => { e.preventDefault(); void sendLink(); }}>
            <div className="field">
              <label htmlFor="cr-firm-email">Email</label>
              <input id="cr-firm-email" type="email" autoComplete="username" required disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {err && <p className="login-err" role="alert">{err}</p>}
            <button type="submit" className="btn" style={{ width: "100%" }} disabled={busy}>
              {busy ? "Sending…" : "Send sign-in link"}
            </button>
            </form>
          </>
        )}
        <p className="muted" style={{ marginTop: 14 }}>
          Staff? <Link href="/login">Staff sign in</Link>
        </p>
      </div>
    </div>
  );
}
