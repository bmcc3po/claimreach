"use client";
import { useState, useEffect } from "react";
import Icon from "./ui/Icon";

export default function NotifyBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/notify");
      const d = await r.json();
      setItems(d.notifications ?? []);
    } catch { /* ignore */ }
    try {
      const a = await fetch("/api/alerts");
      const ad = await a.json();
      setAlerts(ad.alerts ?? []);
    } catch { /* ignore */ }
  }
  // Poll only while this tab is on screen. A dozen background tabs each asking
  // every minute is load for nothing.
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000);
    const onShow = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, []);

  const unread = items.filter((i) => !i.read_at).length + alerts.length;

  async function markRead(id: string) {
    await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "read", id }) });
    setItems((l) => l.map((i) => i.id === id ? { ...i, read_at: new Date().toISOString() } : i));
  }
  async function send() {
    if (!body.trim()) return;
    await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    setBody(""); setComposing(false); load();
  }

  // Files dragging past their deadline show by name and reason; the engine's
  // titles read "Reason, Name", so they are split for the two lines.
  const split = (t: string) => { const m = String(t || "").split(/\s+[\u2014-]\s+/); return m.length > 1 ? { name: m.slice(1).join(" "), why: m[0] } : { name: t, why: "" }; };
  const when = (ts: string) => new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div style={{ position: "relative" }}>
      <button className="cl-iconbtn" onClick={() => setOpen(!open)} aria-label={unread ? `${unread} notifications` : "Notifications"} aria-expanded={open}>
        <Icon name="bell" size={19} />
        {unread > 0 && <span className="cl-dotn">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="cl-pop" role="dialog" aria-label="Notifications">
          <div className="cl-ph">
            <span className="cl-ph-t">Notifications</span>
            <span className="cl-ph-r"><button className="cl-link" onClick={() => setComposing(!composing)}>{composing ? "Cancel" : "Notify staff"}</button></span>
          </div>
          {composing && (
            <div className="cl-compose">
              <textarea className="cl-area" rows={3} placeholder="Message to all staff" value={body} onChange={(e) => setBody(e.target.value)} />
              <div className="cl-acts"><button className="cl-btn cl-gold cl-sm" onClick={send} disabled={!body.trim()}>Send to all</button></div>
            </div>
          )}
          <div className="cl-pop-b">
            {alerts.length > 0 && (
              <>
                <div className="cl-pop-sec">Dragging files</div>
                {alerts.map((a, i) => {
                  const t = split(a.title);
                  return (
                    <a key={i} href={`/leads/${a.lead_no || a.lead_id}`} className="cl-row">
                      <span className={`cl-dot ${a.severity === "bad" ? "cl-bad" : "cl-warn"}`} />
                      <span className="cl-row-m"><span className="cl-t1">{t.name}</span><span className="cl-t2">{t.why ? `${t.why}. ` : ""}{a.sub}</span></span>
                    </a>
                  );
                })}
              </>
            )}
            {(items.length > 0 || alerts.length > 0) && <div className="cl-pop-sec">From the team</div>}
            {items.length === 0 && <div className="cl-empty">Nothing new.</div>}
            {items.map((n) => (
              <div key={n.id} className="cl-row" onClick={() => !n.read_at && markRead(n.id)}
                style={{ cursor: n.read_at ? "default" : "pointer", opacity: n.read_at ? 0.6 : 1, alignItems: "flex-start" }}>
                <span className={`cl-dot ${n.read_at ? "" : "cl-info"}`} style={{ marginTop: 6 }} />
                <span className="cl-row-m">
                  <span style={{ fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{n.body}</span>
                  <span className="cl-t2">{n.sender_name}, {when(n.created_at)}{!n.read_at ? ". Click to mark read" : ""}</span>
                  {n.lead_id && <a className="cl-link" href={`/leads/${n.lead_id}`} style={{ marginTop: 4 }}>Open the file</a>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
