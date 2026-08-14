"use client";
export const runtime = "edge";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

function quietSignInError(raw: string) {
  const m = (raw || "").toLowerCase();
  if (m.includes("invalid") || m.includes("credentials") || m.includes("password")) {
    return "That email or password didn’t match.";
  }
  return "Couldn’t sign in. Try again.";
}

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true); setErr(null);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setErr(quietSignInError(error.message)); return; }
    router.push("/dashboard");
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
          <Logo height={34} />
          <ThemeToggle />
        </div>
        <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Sign in</h1>
        <p className="muted" style={{ marginTop: 0 }}>Staff access to ClaimReach</p>
        <div className="field">
          <label htmlFor="cr-email">Email</label>
          <input id="cr-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cr-password">Password</label>
          <div className="pw-wrap">
            <input id="cr-password" type={showPw ? "text" : "password"} autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && signIn()} />
            <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}>
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {err && <p className="login-err">{err}</p>}
        <button className="btn" style={{ width: "100%" }} disabled={busy} onClick={signIn}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted" style={{ marginTop: 14 }}>
          Firm partner? <Link href="/firm-login">Firm portal login</Link>
        </p>
      </div>
    </div>
  );
}
