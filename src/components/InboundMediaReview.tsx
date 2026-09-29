"use client";
import { useEffect, useState } from "react";

// Texted-in pictures and documents waiting for a person: the sender's number
// is on no file or on several, or the download failed. Staff see the list;
// owners, admins and managers file each one on the right case.

type Candidate = { id: string; lead_no: string | null; name: string | null; firm: string | null };
type Item = {
  id: string;
  media_url: string;
  content_type: string | null;
  phone_norm: string | null;
  lead_id: string | null;
  status: "quarantined" | "failed" | "pending";
  last_error: string | null;
  candidates: Candidate[] | null;
  created_at: string;
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function fmtPhone(p: string | null): string {
  const d = String(p ?? "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d || "Unknown number";
}

function statusLabel(s: Item["status"]): string {
  if (s === "quarantined") return "Needs a file";
  if (s === "failed") return "Download failed";
  return "Stuck";
}

export default function InboundMediaReview() {
  const [items, setItems] = useState<Item[]>([]);
  const [canResolve, setCanResolve] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  async function load() {
    setLoadErr("");
    try {
      const r = await fetch("/api/inbound-media");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setLoadErr(d.error || "Could not load texted-in files."); return; }
      setItems(d.items ?? []);
      setCanResolve(!!d.can_resolve);
    } catch {
      setLoadErr("Could not load texted-in files. Check your connection.");
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => { load(); }, []);

  async function file(item: Item, target: { lead_id?: string; lead_no?: string }) {
    setBusy(item.id);
    setMsg((m) => ({ ...m, [item.id]: "" }));
    try {
      const r = await fetch("/api/inbound-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, ...target }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        setMsg((m) => ({ ...m, [item.id]: d.error || "Could not file it." }));
        await load();
        return;
      }
      setItems((list) => list.filter((x) => x.id !== item.id));
    } catch {
      setMsg((m) => ({ ...m, [item.id]: "Could not file it. Check your connection." }));
    } finally {
      setBusy(null);
    }
  }

  function fileTyped(item: Item) {
    const v = (typed[item.id] ?? "").trim();
    if (!v) { setMsg((m) => ({ ...m, [item.id]: "Enter the lead number or paste the file's link." })); return; }
    const id = v.match(UUID)?.[0];
    file(item, id ? { lead_id: id } : { lead_no: v });
  }

  // Nothing waiting, nothing shown.
  if (!loaded || (!loadErr && !items.length)) return null;

  return (
    <div className="side-card" style={{ maxWidth: 880 }}>
      <h3>Texted-in files to place</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Pictures and documents texted in from a number that is on no file, or on more than one, wait here instead of being guessed.
        {canResolve ? " Pick the right file and it goes into that case's Documents." : " An owner, admin or manager files them."}
      </p>
      {loadErr && <p style={{ color: "var(--danger)" }}>{loadErr}</p>}
      {items.map((it) => (
        <div key={it.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
            <strong>{statusLabel(it.status)}</strong>
            <span>From {fmtPhone(it.phone_norm)}</span>
            <span className="muted">{new Date(it.created_at).toLocaleString()}</span>
            {/^https:\/\//i.test(it.media_url) && (
              <a href={it.media_url} target="_blank" rel="noopener noreferrer nofollow">View</a>
            )}
          </div>
          {it.last_error && <div className="muted" style={{ fontSize: 13 }}>{it.last_error}</div>}
          {canResolve && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {(it.candidates ?? []).map((c) => (
                <button key={c.id} className="btn secondary" disabled={busy === it.id} onClick={() => file(it, { lead_id: c.id })}>
                  File on {c.lead_no || "file"}{c.name ? `, ${c.name}` : ""}{c.firm ? ` (${c.firm})` : ""}
                </button>
              ))}
              <input
                aria-label="Lead number or file link"
                placeholder="Lead number or file link"
                value={typed[it.id] ?? ""}
                onChange={(e) => setTyped((t) => ({ ...t, [it.id]: e.target.value }))}
                style={{ minWidth: 220 }}
              />
              <button className="btn" disabled={busy === it.id} onClick={() => fileTyped(it)}>
                {busy === it.id ? "Filing..." : "File it"}
              </button>
            </div>
          )}
          {msg[it.id] && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 6 }}>{msg[it.id]}</div>}
        </div>
      ))}
    </div>
  );
}
