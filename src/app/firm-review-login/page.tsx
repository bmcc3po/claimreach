'use client';
export const runtime = 'edge';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import '../firm-review/review.css';
export default function FirmReviewLogin() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const result = await supabaseBrowser().auth.signInWithOtp({ email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Ffirm-review` } });
      if (result.error) throw new Error('Could not send your sign-in link. Please try again.');
      setSent(true);
    } catch(e) { setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.'); } finally { setBusy(false); }
  }
  return <main className="firm-review"><section className="fr-login"><span className="fr-brand">ClaimReach · Firm inbox</span><h1>Your client files</h1>
    <p>Intakes, signed agreements, and case decisions in one place.</p>
    {sent ? <p role="status">Check your work email for your sign-in link. Open it on this device.</p> : <form onSubmit={submit}>
      <label htmlFor="firm-email">Work email<input id="firm-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      {error && <p role="alert" className="fr-error">{error}</p>}<button disabled={busy}>{busy ? 'Sending…' : 'Email my sign-in link'}</button>
    </form>}</section></main>;
}
