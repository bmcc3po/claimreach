"use client";
export const runtime = "edge";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true); setErr(null);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.push("/leads");
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
          <Logo height={34} />
          <ThemeToggle />
        </div>
        <p className="muted" style={{ marginTop: 0 }}>Staff sign in</p>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && signIn()} />
        </div>
        {err && <p style={{ color: "var(--danger)", fontSize: 13 }}>{err}</p>}
        <button className="btn" style={{ width: "100%" }} disabled={busy} onClick={signIn}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted" style={{ marginTop: 14 }}>
          Firm partner? <a href="/firm-login">Firm portal login</a>
        </p>
      </div>
    </div>
  );
}
