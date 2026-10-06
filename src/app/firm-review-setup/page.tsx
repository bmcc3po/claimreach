'use client';
export const runtime = 'edge';
import { useEffect, useState } from 'react';
import '../firm-review/review.css';
export default function FirmReviewSetup() {
  const [campaigns, setCampaigns] = useState<any[]>([]), [campaign, setCampaign] = useState('');
  const [people, setPeople] = useState([{ name: '', email: '', ready: false }, { name: '', email: '', ready: false }]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [restrictExisting, setRestrictExisting] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCampaign(params.get('campaign') || '');
    setPeople([1, 2].map(i => ({ name: params.get(`name${i}`) || '', email: params.get(`email${i}`) || '', ready: false })));
    fetch('/api/firm-review-admin', { cache: 'no-store' }).then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error); setCampaigns(data.campaigns); }).catch(e => setError(e.message));
  }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      for (let i = 0; i < people.length; i++) {
        if (people[i].ready) continue;
        const res = await fetch('/api/firm-review-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...people[i], campaign, restrict_existing: restrictExisting }) });
        const data = await res.json(); if (!res.ok) throw new Error(`${people[i].name}: ${data.error}`);
        setPeople(rows => rows.map((row, n) => n === i ? { ...row, ready: true } : row));
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Setup did not finish.'); } finally { setBusy(false); }
  }
  const locked = busy || people.some(p => p.ready);
  return <main className="firm-review"><header><div><span className="fr-brand">ClaimReach · Owner setup</span><h1>Give the firm access</h1><p>Only delivered files in the selected campaign. Intake and retainer PDFs, receipt, and case decisions.</p></div></header>
    {error && <div role="alert" className="fr-error">{error}</div>}
    <form onSubmit={create} className="fr-files"><article><label>Campaign<select required value={campaign} disabled={locked} onChange={e => setCampaign(e.target.value)}><option value="">Choose campaign</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></article>
      {people.map((person, i) => <article key={i}><h2>{person.ready ? '✓ Login ready' : `Person ${i + 1}`}</h2>
        <label>Name<input required value={person.name} disabled={busy || person.ready} onChange={e => setPeople(rows => rows.map((row, n) => n === i ? { ...row, name: e.target.value } : row))} /></label>
        <label>Work email<input type="email" required value={person.email} disabled={busy || person.ready} onChange={e => setPeople(rows => rows.map((row, n) => n === i ? { ...row, email: e.target.value } : row))} /></label></article>)}
      {!people.every(p => p.ready) && <article><label><input type="checkbox" checked={restrictExisting} disabled={locked} onChange={e => setRestrictExisting(e.target.checked)} /> Restrict existing firm logins to this campaign inbox</label><p>This removes their general firm access. Existing logins and history stay intact. Staff accounts cannot be converted here.</p></article>}
      {people.every(p => p.ready) ? <article role="status"><h2>Both logins are ready</h2><p>Have each person open <a href="/firm-review-login">claimreach.com/firm-review-login</a> and request a sign-in link at their own work email.</p></article> : <button disabled={busy || !campaigns.length}>{busy ? 'Saving logins…' : 'Save restricted logins'}</button>}
    </form></main>;
}
