"use client";
import { useState, useEffect } from "react";

const EVENT_TYPES = ["lead.created", "lead.qualified", "lead.signed", "lead.dq", "lead.updated", "retainer.signed"];

export default function IntegrationsManager() {
  const [keys, setKeys] = useState<any[]>([]);
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [firms, setFirms] = useState<any[]>([]);
  const [reveal, setReveal] = useState<{ key_id: string; secret: string } | null>(null);
  const [epSecret, setEpSecret] = useState<string | null>(null);
  const [tab, setTab] = useState<"keys" | "webhooks" | "justcall" | "esign" | "unmatched" | "log" | "docs">("keys");
  const [jcKey, setJcKey] = useState(""); const [jcSecret, setJcSecret] = useState(""); const [jcFirm, setJcFirm] = useState(""); const [jcNumber, setJcNumber] = useState("");
  const [swKey, setSwKey] = useState(""); const [swFirm, setSwFirm] = useState(""); const [swTest, setSwTest] = useState(true);
  const [unmatched, setUnmatched] = useState<any[]>([]);
  const [canon, setCanon] = useState<any | null>(null);

  // create-key form
  const [kLabel, setKLabel] = useState(""); const [kScope, setKScope] = useState<"firm" | "master">("firm"); const [kFirm, setKFirm] = useState("");
  // create-endpoint form
  const [eUrl, setEUrl] = useState(""); const [eFirm, setEFirm] = useState(""); const [eEvents, setEEvents] = useState<string[]>([]);
  const [eName, setEName] = useState(""); const [eCampaign, setECampaign] = useState("");
  const [campaigns, setCampaigns] = useState<any[]>([]);
  // Which endpoint's field map is open, and the map being edited.
  const [mapFor, setMapFor] = useState<any>(null);
  const [mapFields, setMapFields] = useState<{ lead_fields: any[]; questions: any[] }>({ lead_fields: [], questions: [] });
  const [draftMap, setDraftMap] = useState<Record<string, string>>({});
  const [mapBusy, setMapBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const d = await (await fetch("/api/campaigns")).json();
        setCampaigns(d.campaigns ?? d ?? []);
      } catch {}
    })();
  }, []);

  async function openMap(ep: any) {
    setMapFor(ep);
    setDraftMap({ ...(ep.field_map ?? {}) });
    setMapFields({ lead_fields: [], questions: [] });
    try {
      const q = ep.campaign_id ? `?campaign_id=${ep.campaign_id}` : "";
      const d = await (await fetch(`/api/integrations/mappable${q}`)).json();
      setMapFields({ lead_fields: d.lead_fields ?? [], questions: d.questions ?? [] });
    } catch {}
  }
  async function saveMap() {
    if (!mapFor) return;
    setMapBusy(true);
    // Blank targets mean "do not send this field", so they are stripped rather
    // than saved as empty strings that would send empty keys.
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(draftMap)) if (v && v.trim()) clean[k] = v.trim();
    await fetch("/api/integrations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "update_endpoint", id: mapFor.id, field_map: clean }),
    });
    setMapBusy(false); setMapFor(null); load();
  }

  async function load() {
    const r = await fetch("/api/integrations"); const d = await r.json();
    setKeys(d.keys ?? []); setEndpoints(d.endpoints ?? []); setEvents(d.events ?? []); setFirms(d.firms ?? []);
    if (d.firms?.[0]) { setKFirm((f) => f || d.firms[0].id); setEFirm((f) => f || d.firms[0].id); }
  }
  useEffect(() => { load(); fetch("/api/canonical").then((r) => r.json()).then(setCanon).catch(() => {}); }, []);

  async function createKey() {
    const r = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "create_key", label: kLabel, scope: kScope, firm_id: kFirm }) });
    const d = await r.json();
    if (d.ok) { setReveal({ key_id: d.key_id, secret: d.secret }); setKLabel(""); load(); }
    else alert(d.error || "Failed");
  }
  async function revokeKey(id: string) { if (!confirm("Revoke this key? Integrations using it will stop working.")) return; await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "revoke_key", id }) }); load(); }
  async function createEndpoint() {
    if (!eUrl) return;
    const r = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "create_endpoint", url: eUrl, firm_id: eFirm, events: eEvents, name: eName, campaign_id: eCampaign || null }) });
    const d = await r.json();
    if (d.ok) { setEpSecret(d.secret); setEUrl(""); setEName(""); setECampaign(""); setEEvents([]); load(); } else alert(d.error || "Failed");
  }
  async function revokeEndpoint(id: string) { if (!confirm("Disable this webhook endpoint?")) return; await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "revoke_endpoint", id }) }); load(); }

  async function loadUnmatched() {
    const r = await fetch("/api/communications?unmatched=1"); const d = await r.json();
    setUnmatched(d.comms ?? []);
  }
  async function saveJustcall() {
    if (!jcKey || !jcSecret) { alert("API key and secret required."); return; }
    const r = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "save_justcall", api_key: jcKey, api_secret: jcSecret, firm_id: jcFirm || null, justcall_number: jcNumber }) });
    const d = await r.json();
    if (d.ok) { setJcKey(""); setJcSecret(""); setJcNumber(""); alert("JustCall account saved."); } else alert(d.error || "Failed");
  }

  async function saveSignwell() {
    if (!swKey) { alert("SignWell API key required."); return; }
    const r = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "save_esign", api_key: swKey, firm_id: swFirm || null, test_mode: swTest }) });
    const d = await r.json();
    if (d.ok) { setSwKey(""); alert("SignWell account saved."); } else alert(d.error || "Failed");
  }

  const base = typeof window !== "undefined" ? window.location.origin : "https://claimreach.com";
  const firmName = (id: string) => firms.find((f) => f.id === id)?.name ?? (id ? "—" : "Master");

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Integrations</h1>
      <p className="muted" style={{ marginTop: 0 }}>API keys, inbound lead webhooks, and outbound event webhooks. HMAC-signed.</p>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {(["keys", "webhooks", "justcall", "esign", "unmatched", "log", "docs"] as const).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => { setTab(t); if (t === "unmatched") loadUnmatched(); }}>{t === "keys" ? "API Keys" : t === "webhooks" ? "Webhooks" : t === "justcall" ? "JustCall" : t === "esign" ? "eSign" : t === "unmatched" ? "Unmatched" : t === "log" ? "Event Log" : "Docs"}</button>
        ))}
      </div>

      {reveal && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "var(--ok)" }}>
          <strong>Key created, copy the secret now (shown once):</strong>
          <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 13 }}>
            <div>Key ID: <b>{reveal.key_id}</b></div>
            <div>Secret: <b>{reveal.secret}</b></div>
          </div>
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setReveal(null)}>Done</button>
        </div>
      )}
      {epSecret && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "var(--ok)" }}>
          <strong>Endpoint created. Signing secret (verify our signature with this):</strong>
          <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 13 }}>{epSecret}</div>
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setEpSecret(null)}>Done</button>
        </div>
      )}

      {tab === "keys" && (
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="section-title">Create API key</div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input placeholder="Label (e.g. TMP inbound)" value={kLabel} onChange={(e) => setKLabel(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
              <select value={kScope} onChange={(e) => setKScope(e.target.value as any)} style={{ width: "auto" }}><option value="firm">Firm key</option><option value="master">Master key</option></select>
              {kScope === "firm" && <select value={kFirm} onChange={(e) => setKFirm(e.target.value)} style={{ width: "auto" }}>{firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
              <button className="btn" onClick={createKey}>Create</button>
            </div>
          </div>
          <table className="data-table"><thead><tr><th>Label</th><th>Key ID</th><th>Scope</th><th>Firm</th><th>Last used</th><th></th></tr></thead><tbody>
            {keys.map((k) => (
              <tr key={k.id} style={{ opacity: k.active ? 1 : 0.4 }}>
                <td>{k.label}</td><td style={{ fontFamily: "monospace", fontSize: 12 }}>{k.key_id}</td><td>{k.scope}</td><td>{firmName(k.firm_id)}</td>
                <td className="muted">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}</td>
                <td>{k.active && <button className="btn ghost sm" onClick={() => revokeKey(k.id)}>Revoke</button>}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {tab === "webhooks" && (
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="section-title">Add outbound webhook</div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <input placeholder="Name it, e.g. Lexamica" value={eName} onChange={(e) => setEName(e.target.value)} style={{ width: 160 }} />
              <input placeholder="https://their-system.com/hook" value={eUrl} onChange={(e) => setEUrl(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
              <select value={eFirm} onChange={(e) => setEFirm(e.target.value)} style={{ width: "auto" }}>{firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
              <select value={eCampaign} onChange={(e) => setECampaign(e.target.value)} style={{ width: "auto" }}>
                <option value="">All campaigns for this firm</option>
                {campaigns.filter((c: any) => !eFirm || c.firm_id === eFirm).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button className="btn" onClick={createEndpoint}>Add</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              Pick a campaign when the receiver only wants that campaign's leads, or when it needs
              its own field names. Different campaigns ask different questions, so they rarely map the same way.
            </p>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {EVENT_TYPES.map((ev) => (
                <label key={ev} className={`chip ${eEvents.includes(ev) ? "on" : ""}`} style={{ cursor: "pointer" }}>
                  <input type="checkbox" style={{ marginRight: 5 }} checked={eEvents.includes(ev)} onChange={(e) => setEEvents((s) => e.target.checked ? [...s, ev] : s.filter((x) => x !== ev))} />{ev}
                </label>
              ))}
            </div>
          </div>
          <table className="data-table"><thead><tr><th>Name</th><th>URL</th><th>Firm</th><th>Campaign</th><th>Events</th><th>Fields</th><th></th></tr></thead><tbody>
            {endpoints.map((ep) => {
              const mapped = Object.keys(ep.field_map ?? {}).length;
              return (
                <tr key={ep.id} style={{ opacity: ep.active ? 1 : 0.4 }}>
                  <td>{ep.name || "—"}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{ep.url}</td>
                  <td>{firmName(ep.firm_id)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {ep.campaign_id ? (campaigns.find((c: any) => c.id === ep.campaign_id)?.name ?? "campaign") : "all"}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{(ep.events || []).join(", ")}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {mapped > 0 ? `${mapped} mapped` : "our field names"}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn ghost sm" onClick={() => openMap(ep)}>Map fields</button>
                    {ep.active && <button className="btn ghost sm" onClick={() => revokeEndpoint(ep.id)}>Disable</button>}
                  </td>
                </tr>
              );
            })}
          </tbody></table>

          {mapFor && (
            <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) setMapFor(null); }}>
              <div className="modal" style={{ maxWidth: 720, padding: "18px 20px", maxHeight: "82vh", overflow: "auto" }}>
                <h3 style={{ marginTop: 0 }}>Field names for {mapFor.name || mapFor.url}</h3>
                <p className="muted" style={{ marginTop: 0 }}>
                  Type the name the receiver expects next to each field you want to send. Leave a row blank to leave it out.
                  Map nothing and we send our own field names unchanged.
                </p>
                {!mapFor.campaign_id && (
                  <p className="muted" style={{ fontSize: 12 }}>
                    This endpoint is not bound to a campaign, so only the fields on every file are listed.
                    Bind it to a campaign to map that campaign's questions.
                  </p>
                )}
                <div className="section-title" style={{ marginTop: 12 }}>On every file</div>
                {mapFields.lead_fields.map((f: any) => (
                  <div className="row" key={f.id} style={{ gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{f.label} <span className="muted" style={{ fontFamily: "monospace", fontSize: 11 }}>{f.id}</span></span>
                    <input placeholder="their field name" value={draftMap[f.id] ?? ""} style={{ width: 220 }}
                      onChange={(e) => setDraftMap((m) => ({ ...m, [f.id]: e.target.value }))} />
                  </div>
                ))}
                {mapFields.questions.length > 0 && (
                  <>
                    <div className="section-title" style={{ marginTop: 16 }}>Intake questions ({mapFields.questions.length})</div>
                    {mapFields.questions.map((f: any) => (
                      <div className="row" key={f.id} style={{ gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <span style={{ flex: 1, fontSize: 13 }}>{String(f.label).slice(0, 70)} <span className="muted" style={{ fontFamily: "monospace", fontSize: 11 }}>{f.id}</span></span>
                        <input placeholder="their field name" value={draftMap[f.id] ?? ""} style={{ width: 220 }}
                          onChange={(e) => setDraftMap((m) => ({ ...m, [f.id]: e.target.value }))} />
                      </div>
                    ))}
                  </>
                )}
                <div className="row" style={{ justifyContent: "flex-end", marginTop: 16, gap: 8 }}>
                  <button className="btn ghost" onClick={() => setMapFor(null)}>Cancel</button>
                  <button className="btn" disabled={mapBusy} onClick={saveMap}>{mapBusy ? "Saving" : "Save field names"}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "justcall" && (
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="section-title">Connect JustCall</div>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Enter your JustCall API key + secret (JustCall → Settings → API). Used for click-to-call and outbound SMS.</p>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input placeholder="API Key" value={jcKey} onChange={(e) => setJcKey(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
              <input placeholder="API Secret" value={jcSecret} onChange={(e) => setJcSecret(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
              <input placeholder="Sending number +1702..." value={jcNumber} onChange={(e) => setJcNumber(e.target.value)} style={{ flex: 1, minWidth: 150 }} />
              <select value={jcFirm} onChange={(e) => setJcFirm(e.target.value)} style={{ width: "auto" }}><option value="">Master / default</option>{firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
              <button className="btn" onClick={saveJustcall}>Save</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>The sending number is the JustCall line texts go out from (E.164, e.g. +17025551212). Note: JustCall has no click-to-call API, the Call button opens your JustCall dialer; SMS sends through the API.</p>
          </div>
          <div className="card" style={{ padding: 16, fontSize: 13.5, lineHeight: 1.6 }}>
            <div className="section-title">Webhook URL for JustCall</div>
            <p style={{ marginTop: 0 }}>In JustCall, point your call / SMS / voicemail webhooks at:</p>
            <pre style={{ background: "var(--surface-2)", padding: 12, borderRadius: 8, overflow: "auto", fontSize: 12 }}>{`${base}/api/justcall/webhook`}</pre>
            <p className="muted" style={{ fontSize: 12 }}>Optional: set JUSTCALL_WEBHOOK_SECRET in Cloudflare and append ?secret=… or send X-JustCall-Secret to lock it down. Calls, SMS, and voicemails auto-attach to the matching file by phone number.</p>
          </div>
        </div>
      )}

      {tab === "esign" && (
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="section-title">Connect SignWell (certified eSign)</div>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Paste your SignWell API key (SignWell → Settings → API). Used for court-admissible retainer signing with full audit trail.</p>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input placeholder="SignWell API Key" value={swKey} onChange={(e) => setSwKey(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
              <select value={swFirm} onChange={(e) => setSwFirm(e.target.value)} style={{ width: "auto" }}><option value="">Master / default</option>{firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
              <label className="row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={swTest} onChange={(e) => setSwTest(e.target.checked)} style={{ width: "auto" }} /> Test mode</label>
              <button className="btn" onClick={saveSignwell}>Save</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Leave Test mode ON until you are ready for live, legally binding documents. Test docs are free and not billed.</p>
          </div>
          <div className="card" style={{ padding: 16, fontSize: 13.5, lineHeight: 1.6 }}>
            <div className="section-title">Webhook URL for SignWell</div>
            <p style={{ marginTop: 0 }}>In SignWell, register this callback so signed documents flow back automatically:</p>
            <pre style={{ background: "var(--surface-2)", padding: 12, borderRadius: 8, overflow: "auto", fontSize: 12 }}>{`${base}/api/esign/webhook`}</pre>
            <p className="muted" style={{ fontSize: 12 }}>When a retainer is signed, the file flips to Signed, the completed PDF is stored, and your outbound retainer.signed event fires. Lighter, non-certified documents use the built-in signing page at /sign/[id] (no SignWell needed).</p>
          </div>
        </div>
      )}

      {tab === "unmatched" && (
        <div>
          <p className="muted" style={{ fontSize: 13 }}>Calls/SMS/voicemails whose phone number didn't match any file. Assign manually, or they auto-attach when a file with that number is created.</p>
          <table className="data-table"><thead><tr><th>When</th><th>Type</th><th>Dir</th><th>Phone</th><th>Preview</th><th></th></tr></thead><tbody>
            {unmatched.map((c) => (
              <tr key={c.id}>
                <td className="muted">{c.occurred_at ? new Date(c.occurred_at).toLocaleString() : ""}</td>
                <td>{c.channel}</td><td>{c.direction}</td><td style={{ fontFamily: "monospace", fontSize: 12 }}>{c.phone_raw}</td>
                <td className="muted" style={{ fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.body || c.jc_summary || (c.recording_url ? "recording" : "")}</td>
                <td><AssignComm id={c.id} onDone={loadUnmatched} /></td>
              </tr>
            ))}
            {unmatched.length === 0 && <tr><td colSpan={6} className="muted">Nothing unmatched.</td></tr>}
          </tbody></table>
        </div>
      )}

      {tab === "log" && (
        <table className="data-table"><thead><tr><th>When</th><th>Dir</th><th>Event</th><th>Status</th><th>HTTP</th></tr></thead><tbody>
          {events.map((e) => (
            <tr key={e.id}><td className="muted">{new Date(e.created_at).toLocaleString()}</td><td>{e.direction}</td><td>{e.event_type}</td>
              <td><span className={`badge ${e.status === "delivered" || e.status === "received" ? "signed" : "dq"}`}>{e.status}</span></td><td>{e.http_status || "—"}</td></tr>
          ))}
          {events.length === 0 && <tr><td colSpan={5} className="muted">No events yet.</td></tr>}
        </tbody></table>
      )}

      {tab === "docs" && (
        <div className="card" style={{ padding: 18, fontSize: 13.5, lineHeight: 1.6 }}>
          <div className="section-title">Inbound: push a lead to ClaimReach</div>
          <p>POST a JSON lead to your inbound URL. Sign the raw body with HMAC-SHA256 using your key secret.</p>
          <pre style={{ background: "var(--surface-2)", padding: 12, borderRadius: 8, overflow: "auto", fontSize: 12 }}>{`POST ${base}/api/hooks/in/{KEY_ID}
Headers:
  Content-Type: application/json
  X-CR-Signature: sha256=<hmac_sha256(secret, raw_body)>
Body:
  {
    "first_name": "Jane", "last_name": "Doe",
    "phone": "7025551212", "email": "jane@x.com",
    "claim_type": "mva", "external_id": "THEIR-123"
  }`}</pre>
          <div className="section-title" style={{ marginTop: 14 }}>Outbound: we POST events to you</div>
          <p>We send signed events to your webhook URLs. Verify our signature with the endpoint secret.</p>
          <pre style={{ background: "var(--surface-2)", padding: 12, borderRadius: 8, overflow: "auto", fontSize: 12 }}>{`POST {your_url}
Headers:
  X-CR-Event: lead.signed
  X-CR-Signature: sha256=<hmac of body using endpoint secret>
Body:
  { "event":"lead.signed", "sent_at":"...", "data":{ "lead_id":"...", "lead_no":"..." } }`}</pre>
          <div className="section-title" style={{ marginTop: 14 }}>REST: pull your leads</div>
          <pre style={{ background: "var(--surface-2)", padding: 12, borderRadius: 8, overflow: "auto", fontSize: 12 }}>{`GET ${base}/api/v1/leads?status=signed&limit=50
Headers:
  X-CR-Key: {KEY_ID}`}</pre>

          {canon && (
            <>
              <div className="section-title" style={{ marginTop: 18 }}>Canonical fields (the universal spine)</div>
              <p className="muted" style={{ marginTop: 0 }}>Map your fields to these stable IDs once. They never change, and they work across every campaign. Sensitive fields are restricted.</p>
              <div className="canon-grid">
                {canon.spine.map((f: any) => (
                  <div key={f.id} className="canon-chip" title={f.group}>
                    <code>{f.id}</code><span>{f.label}{f.sensitive ? " 🔒" : ""}</span>
                  </div>
                ))}
              </div>
              <div className="section-title" style={{ marginTop: 16 }}>Case-type presets (spine + these extras)</div>
              {canon.presets.map((p: any) => (
                <details key={p.key} style={{ marginBottom: 6 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13 }}><b>{p.label}</b> <span className="muted">({p.family.replace("_", "-")}, {p.extras.length} extras)</span></summary>
                  <div className="canon-grid" style={{ marginTop: 6 }}>
                    {p.extras.map((f: any) => <div key={f.id} className="canon-chip"><code>{f.id}</code><span>{f.label}</span></div>)}
                  </div>
                </details>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AssignComm({ id, onDone }: { id: string; onDone: () => void }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  async function assign() {
    if (!v.trim()) return;
    setBusy(true);
    const r = await fetch("/api/communications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "assign", id, lead_id: v.trim() }) });
    setBusy(false);
    if (r.ok) onDone(); else { const d = await r.json().catch(() => ({})); alert(d.error || "Failed"); }
  }
  return (
    <span className="row" style={{ gap: 4 }}>
      <input placeholder="lead id" value={v} onChange={(e) => setV(e.target.value)} style={{ width: 120, fontSize: 12 }} />
      <button className="btn ghost sm" onClick={assign} disabled={busy}>Assign</button>
    </span>
  );
}
