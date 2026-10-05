"use client";
export const runtime = "edge";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { workArea, inWorkArea, areaHref } from '@/lib/work-area';
import { currentIntakeHref, isNetflyIntake } from '@/lib/intake-links';

export default function AddLead() {
  const area = workArea(useSearchParams().get('area'));
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [firmRef, setFirmRef] = useState("");
  const [lrRef, setLrRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { (async () => {
    try {
      const d = await (await fetch("/api/campaigns")).json();
      const active = (d.campaigns ?? []).filter((c: any) => c.active && inWorkArea(c.case_type, area));
      setCampaigns(active);
      if (active[0]) setCampaignId(active[0].id);
    } catch {}
  })(); }, [area]);

  const campaign = campaigns.find((c) => c.id === campaignId);

  async function create(thenIntake: boolean) {
    if (!campaign) { setErr("Pick a campaign first. If none exist, create one in Settings > Campaigns."); return; }
    if (isNetflyIntake(campaign.case_type, campaign.name)) { router.push('/app/netfly#new-file'); return; }
    if (!firstName.trim() && !lastName.trim()) { setErr("Enter at least a first or last name."); return; }
    setBusy(true); setErr(null);
    try {
      const claimantName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
      const r = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "create",
          firm_id: campaign.firm_id,
          campaign_id: campaign.id,
          campaign: campaign.name,
          case_type: campaign.case_type,
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          claimant_name: claimantName || null,
          phone: phone || null,
          email: email || null,
          firm_ref_no: firmRef || null,
          lawruler_ref_no: lrRef || null,
          stage: thenIntake ? "intake_in_progress" : "referral_received",
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "could not create lead");
      router.push(thenIntake ? currentIntakeHref(d.lead.id, campaign.case_type, campaign.name) || `/intake/${d.lead.id}` : areaHref("/leads", area));
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h2>Add lead</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Quick-add a referral. Pick the campaign and it sets the firm, case type, intake form, and
          retainer. A ClaimReach lead number is assigned automatically.
        </p>

        <div className="field">
          <label>Campaign</label>
          {campaigns.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>No campaigns yet. <a href="/settings/campaigns">Create one in Settings → Campaigns</a> first.</p>
          ) : (
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {campaign && <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Firm: {campaign.firms?.name || "—"} · Type: {campaign.case_type}{campaign.tier ? ` · Tier ${campaign.tier}` : ""}</p>}
        </div>

        {isNetflyIntake(campaign?.case_type, campaign?.name) ? <>
          <p>Start the NETFLY welcome file with their handoff email and signed agreement.</p>
          <a className="btn" href="/app/netfly#new-file">Create NETFLY file</a>
        </> : <>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>First name</label>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Last name</label>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Phone</label>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Firm reference #</label>
            <input type="text" value={firmRef} onChange={(e) => setFirmRef(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>LawRuler # (optional)</label>
            <input type="text" value={lrRef} onChange={(e) => setLrRef(e.target.value)} />
          </div>
        </div>

        {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" disabled={busy} onClick={() => create(false)}>{busy ? "Saving…" : "Save lead"}</button>
          <button className="btn secondary" disabled={busy} onClick={() => create(true)}>Save &amp; start intake</button>
        </div>
        </>}
      </div>
    </div>
  );
}
