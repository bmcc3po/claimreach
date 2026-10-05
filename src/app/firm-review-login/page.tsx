'use client';
export const runtime = 'edge';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import '../firm-review/review.css';
export default function FirmReviewLogin() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [method, setMethod] = useState<'link' | 'password'>('link');
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const auth = supabaseBrowser().auth;
      const result = method === 'password' ? await auth.signInWithPassword({ email: email.trim().toLowerCase(), password }) : await auth.signInWithOtp({ email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Ffirm-review` } });
      if (result.error) throw new Error(method === 'password' ? 'Please check your email and password.' : 'Could not send your sign-in link. Please try again.');
      if (method === 'password') window.location.assign('/firm-review'); else setSent(true);
    } catch(e) { setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.'); } finally { setBusy(false); }
  }
  return <main className="firm-review"><section className="fr-login"><span className="fr-brand">ClaimReach · Firm inbox</span><h1>Your client files</h1>
    <p>Intakes, signed agreements, and case decisions in one place.</p>
    {sent ? <p role="status">Check your work email for your sign-in link. Open it on this device.</p> : <form onSubmit={submit}>
      <label htmlFor="firm-email">Work email<input id="firm-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      {method === 'password' && <label htmlFor="firm-password">Password<input id="firm-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>}
      {error && <p role="alert" className="fr-error">{error}</p>}<button disabled={busy}>{busy ? 'Signing in…' : method === 'link' ? 'Email my sign-in link' : 'Sign in'}</button>
      <button type="button" className="fr-secondary" onClick={() => { setMethod(method === 'link' ? 'password' : 'link'); setError(''); }}>{method === 'link' ? 'Use a password instead' : 'Use an email sign-in link'}</button>
    </form>}</section></main>;
}
