"use client";
import { useState, useEffect } from "react";

export default function NotifyBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/notify");
      const d = await r.json();
      setItems(d.notifications ?? []);
    } catch { /* ignore */ }
  }
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  const unread = items.filter((i) => !i.read_at).length;

  async function markRead(id: string) {
    await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "read", id }) });
    setItems((l) => l.map((i) => i.id === id ? { ...i, read_at: new Date().toISOString() } : i));
  }
  async function send() {
    if (!body.trim()) return;
    await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    setBody(""); setComposing(false); load();
  }

  return (
    <div style={{ position: "relative" }}>
      <button className="minbtn" onClick={() => setOpen(!open)} style={{ fontSize: 18, position: "relative" }} aria-label="Notifications">
        🔔
        {unread > 0 && <span style={{ position: "absolute", top: -2, right: -2, background: "var(--danger)", color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "0 5px" }}>{unread}</span>}
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: 38, width: 320, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 14px 40px rgba(0,0,0,.2)", zIndex: 90, overflow: "hidden" }}>
          <div className="board-h">
            <h3 style={{ margin: 0, fontSize: 14 }}>Notifications</h3>
            <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => setComposing(!composing)}>{composing ? "Cancel" : "Notify staff"}</button>
          </div>
          {composing && (
            <div style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>
              <textarea rows={3} placeholder="Message to all staff…" value={body} onChange={(e) => setBody(e.target.value)} />
              <button className="btn" style={{ marginTop: 8 }} onClick={send}>Send to all</button>
            </div>
          )}
          <div style={{ maxHeight: 360, overflowY: "auto", padding: "4px 12px 10px" }}>
            {items.length === 0 && <p className="muted" style={{ padding: "10px 0" }}>No notifications.</p>}
            {items.map((n) => (
              <div key={n.id} className="post" onClick={() => !n.read_at && markRead(n.id)}
                style={{ cursor: n.read_at ? "default" : "pointer", opacity: n.read_at ? 0.6 : 1 }}>
                <div style={{ fontSize: 13 }}>{n.body}</div>
                <div className="pmeta">{n.sender_name} · {new Date(n.created_at).toLocaleString()}{!n.read_at && " · tap to mark read"}</div>
                {n.lead_id && <a href={`/leads/${n.lead_id}`} style={{ fontSize: 12 }}>Open file →</a>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
