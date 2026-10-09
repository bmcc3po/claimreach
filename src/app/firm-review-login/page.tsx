'use client';
export const runtime = 'edge';
import { useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import '../firm-review/review.css';
export default function FirmReviewLogin() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('');
  const pending = useRef(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const result = await supabaseBrowser().auth.signInWithOtp({ email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Ffirm-review` } });
      if (result.error) { setError('Could not send your sign-in link. Please try again.'); return; }
      setSent(true);
    } catch { setError('Could not confirm the sign-in link. Check your email before trying again.'); } finally { pending.current = false; setBusy(false); }
  }
  return <main className="firm-review"><section className="fr-login"><span className="fr-brand">ClaimReach · Firm inbox</span><h1>Your client files</h1>
    <p>Intakes, signed agreements, and case decisions in one place.</p>
    {sent ? <p role="status">Check your work email for your sign-in link. Open it on this device.</p> : <form onSubmit={submit}>
      <label htmlFor="firm-email">Work email<input id="firm-email" type="email" autoComplete="username" disabled={busy} value={email} onChange={e => setEmail(e.target.value)} required /></label>
      {error && <p role="alert" className="fr-error">{error}</p>}<button disabled={busy}>{busy ? 'Sending…' : 'Email my sign-in link'}</button>
    </form>}</section></main>;
}
