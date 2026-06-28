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
  const [tab, setTab] = useState<"keys" | "webhooks" | "justcall" | "unmatched" | "log" | "docs">("keys");
  const [jcKey, setJcKey] = useState(""); const [jcSecret, setJcSecret] = useState(""); const [jcFirm, setJcFirm] = useState("");
  const [unmatched, setUnmatched] = useState<any[]>([]);

  // create-key form
  const [kLabel, setKLabel] = useState(""); const [kScope, setKScope] = useState<"firm" | "master">("firm"); const [kFirm, setKFirm] = useState("");
  // create-endpoint form
  const [eUrl, setEUrl] = useState(""); const [eFirm, setEFirm] = useState(""); const [eEvents, setEEvents] = useState<string[]>([]);

  async function load() {
    const r = await fetch("/api/integrations"); const d = await r.json();
    setKeys(d.keys ?? []); setEndpoints(d.endpoints ?? []); setEvents(d.events ?? []); setFirms(d.firms ?? []);
    if (d.firms?.[0]) { setKFirm((f) => f || d.firms[0].id); setEFirm((f) => f || d.firms[0].id); }
  }
  useEffect(() => { load(); }, []);

  async function createKey() {
    const r = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "create_key", label: kLabel, scope: kScope, firm_id: kFirm }) });
    const d = await r.json();
    if (d.ok) { setReveal({ key_id: d.key_id, secret: d.secret }); setKLabel(""); load(); }
    else alert(d.error || "Failed");
  }
  async function revokeKey(id: string) { if (!confirm("Revoke this key? Integrations using it will stop working.")) return; await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "revoke_key", id }) }); load(); }
  async function createEndpoint() {
    if (!eUrl) return;
    const r = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "create_endpoint", url: eUrl, firm_id: eFirm, events: eEvents }) });
    const d = await r.json();
    if (d.ok) { setEpSecret(d.secret); setEUrl(""); setEEvents([]); load(); } else alert(d.error || "Failed");
  }
  async function revokeEndpoint(id: string) { if (!confirm("Disable this webhook endpoint?")) return; await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "revoke_endpoint", id }) }); load(); }

  async function loadUnmatched() {
    const r = await fetch("/api/communications?unmatched=1"); const d = await r.json();
    setUnmatched(d.comms ?? []);
  }
  async function saveJustcall() {
    if (!jcKey || !jcSecret) { alert("API key and secret required."); return; }
    const r = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "save_justcall", api_key: jcKey, api_secret: jcSecret, firm_id: jcFirm || null }) });
    const d = await r.json();
    if (d.ok) { setJcKey(""); setJcSecret(""); alert("JustCall account saved."); } else alert(d.error || "Failed");
  }

  const base = typeof window !== "undefined" ? window.location.origin : "https://claimreach.com";
  const firmName = (id: string) => firms.find((f) => f.id === id)?.name ?? (id ? "—" : "Master");

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Integrations</h1>
      <p className="muted" style={{ marginTop: 0 }}>API keys, inbound lead webhooks, and outbound event webhooks. HMAC-signed.</p>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {(["keys", "webhooks", "justcall", "unmatched", "log", "docs"] as const).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => { setTab(t); if (t === "unmatched") loadUnmatched(); }}>{t === "keys" ? "API Keys" : t === "webhooks" ? "Webhooks" : t === "justcall" ? "JustCall" : t === "unmatched" ? "Unmatched" : t === "log" ? "Event Log" : "Docs"}</button>
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
              <input placeholder="https://their-system.com/hook" value={eUrl} onChange={(e) => setEUrl(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
              <select value={eFirm} onChange={(e) => setEFirm(e.target.value)} style={{ width: "auto" }}>{firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
              <button className="btn" onClick={createEndpoint}>Add</button>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {EVENT_TYPES.map((ev) => (
                <label key={ev} className={`chip ${eEvents.includes(ev) ? "on" : ""}`} style={{ cursor: "pointer" }}>
                  <input type="checkbox" style={{ marginRight: 5 }} checked={eEvents.includes(ev)} onChange={(e) => setEEvents((s) => e.target.checked ? [...s, ev] : s.filter((x) => x !== ev))} />{ev}
                </label>
              ))}
            </div>
          </div>
          <table className="data-table"><thead><tr><th>URL</th><th>Firm</th><th>Events</th><th></th></tr></thead><tbody>
            {endpoints.map((ep) => (
              <tr key={ep.id} style={{ opacity: ep.active ? 1 : 0.4 }}>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{ep.url}</td><td>{firmName(ep.firm_id)}</td><td className="muted" style={{ fontSize: 12 }}>{(ep.events || []).join(", ")}</td>
                <td>{ep.active && <button className="btn ghost sm" onClick={() => revokeEndpoint(ep.id)}>Disable</button>}</td>
              </tr>
            ))}
          </tbody></table>
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
              <select value={jcFirm} onChange={(e) => setJcFirm(e.target.value)} style={{ width: "auto" }}><option value="">Master / default</option>{firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
              <button className="btn" onClick={saveJustcall}>Save</button>
            </div>
          </div>
          <div className="card" style={{ padding: 16, fontSize: 13.5, lineHeight: 1.6 }}>
            <div className="section-title">Webhook URL for JustCall</div>
            <p style={{ marginTop: 0 }}>In JustCall, point your call / SMS / voicemail webhooks at:</p>
            <pre style={{ background: "var(--surface-2)", padding: 12, borderRadius: 8, overflow: "auto", fontSize: 12 }}>{`${base}/api/justcall/webhook`}</pre>
            <p className="muted" style={{ fontSize: 12 }}>Optional: set JUSTCALL_WEBHOOK_SECRET in Cloudflare and append ?secret=… or send X-JustCall-Secret to lock it down. Calls, SMS, and voicemails auto-attach to the matching file by phone number.</p>
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
