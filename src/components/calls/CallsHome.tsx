"use client";
// Calls home. iPhone first: one list at a time, search on top, New call in the
// thumb zone. Tapping any row opens that file's call screen.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { APP_KINDS } from "@/lib/mva-call/links";

export interface HomeRow { id: string; name?: string | null; phone?: string | null; sub?: string | null; at?: string | null; due?: string | null; tag?: string | null; href?: string | null; newPhone?: string | null }
export interface HomeData {
  me: { name: string; role: string };
  campaigns: { id: string; name: string; firm: string; kind: string }[];
  open: HomeRow[]; callbacks: HomeRow[]; waiting: HomeRow[]; done: HomeRow[]; texts: HomeRow[]; review: HomeRow[];
  setup: { campaignId: string; name: string; have: number; need: number; docuseal: boolean }[];
  notes: string[];
}

type Tab = "open" | "review" | "callbacks" | "texts" | "waiting" | "done";

function fmtPhone(raw?: string | null) {
  const d = String(raw || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(raw || "");
}
function ago(iso?: string | null, now = Date.now()) {
  if (!iso) return "";
  const t = Date.parse(iso); if (isNaN(t)) return "";
  const m = Math.round((now - t) / 60000);
  const abs = Math.abs(m);
  const txt = abs < 1 ? "now" : abs < 60 ? `${abs}m` : abs < 1440 ? `${Math.round(abs / 60)}h` : `${Math.round(abs / 1440)}d`;
  if (txt === "now") return "now";
  return m >= 0 ? `${txt} ago` : `in ${txt}`;
}
const STATUS_TEXT: Record<string, string> = {
  new: "New", contacting: "Worked", esign_sent: "E-sign sent", dq: "DQ", not_interested: "Not interested", dnc: "DNC",
  signed_grievous: "Signed", signed_qa: "Signed", signed_wip: "Signed", signed_flag: "Signed", signed_approved: "Signed",
  delivered: "Delivered", retained: "Retained", duplicate: "Duplicate", dead: "Dead",
};
function statusText(k?: string | null) { return k ? STATUS_TEXT[k] || k.replace(/_/g, " ") : ""; }
function clock(iso?: string | null) {
  if (!iso) return "";
  const t = new Date(iso); if (isNaN(t.getTime())) return "";
  const h = t.getHours(), m = t.getMinutes();
  return `${t.getMonth() + 1}/${t.getDate()} ${(h % 12) || 12}:${m < 10 ? "0" : ""}${m} ${h < 12 ? "AM" : "PM"}`;
}

export default function CallsHome({ data }: { data: HomeData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(() => data.callbacks.some((r) => r.due && Date.parse(r.due) <= Date.now())
    ? "callbacks" : data.review.length ? "review" : "open");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [searchErr, setSearchErr] = useState("");
  const [sheet, setSheet] = useState(false);
  const [camp, setCamp] = useState<string>("");
  const [kind, setKind] = useState<string>(() => data.campaigns[0]?.kind || APP_KINDS[0].key);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [setupMsg, setSetupMsg] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  // A DocuSeal signature can arrive while the agent is working the queue.
  // Refresh the server-backed lists while this screen is visible so signed
  // files move into Review without requiring a manual browser reload.
  useEffect(() => {
    const refresh = () => { if (!document.hidden && !sheet && !q.trim()) router.refresh(); };
    const timer = setInterval(refresh, 20000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [router, sheet, q]);
  // "Take a call" in the side menu lands here with ?new=1 (and ?phone= from a text).
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get("phone")) setPhone(p.get("phone") || "");
      if (p.get("new") === "1" || p.get("phone")) { setSheet(true); window.history.replaceState(null, "", "/app"); }
    } catch { /* old browser: they tap New call */ }
  }, []);
  useEffect(() => {
    const use = (id: string) => { const c = data.campaigns.find((x) => x.id === id); if (c) { setCamp(c.id); setKind(c.kind); } };
    try { const last = localStorage.getItem("cr-call-campaign"); if (last && data.campaigns.some((c) => c.id === last)) use(last); else if (data.campaigns[0]) use(data.campaigns[0].id); }
    catch { if (data.campaigns[0]) use(data.campaigns[0].id); }
  }, [data.campaigns]);

  // Search any file, open or done.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setSearchErr(""); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/calls/search?q=${encodeURIComponent(term)}`);
        const d = await r.json();
        if (!r.ok || d.error) { setSearchErr(d.error || "Search did not work."); return; }
        setSearchErr(""); setResults(d.results || []);
      } catch { setSearchErr("Search did not work. Check your signal."); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const lists: Record<Tab, HomeRow[]> = { open: data.open, review: data.review, callbacks: data.callbacks, texts: data.texts, waiting: data.waiting, done: data.done };
  const tabs: [Tab, string][] = [["open", "Open"], ["review", "Review signed"], ["callbacks", "Call backs"], ["texts", "Texts"], ["waiting", "Signing"], ["done", "Recent"]];
  const rows = lists[tab];
  const dueNow = useMemo(() => data.callbacks.filter((r) => r.due && Date.parse(r.due) <= now).length, [data.callbacks, now]);

  async function startCall() {
    if (!camp) { setErr("Pick the attorney."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/calls/new", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaign_id: camp, phone, name }) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Could not start the call.");
      try { localStorage.setItem("cr-call-campaign", camp); } catch { /* private mode */ }
      router.push(`/app/${d.lead_id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  async function setupEsign(campaignId: string) {
    setSetupMsg((m) => ({ ...m, [campaignId]: "Setting up. This takes a minute." }));
    try {
      const r = await fetch("/api/calls/esign-setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaign_id: campaignId }) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Setup did not finish.");
      setSetupMsg((m) => ({ ...m, [campaignId]: "Done. Agreements are ready to send." }));
      router.refresh();
    } catch (e: any) { setSetupMsg((m) => ({ ...m, [campaignId]: e.message })); }
  }

  const kinds = APP_KINDS.filter((k) => data.campaigns.some((c) => c.kind === k.key));
  const lines = data.campaigns.filter((c) => c.kind === kind);
  function pickKind(k: string) {
    setKind(k);
    if (!data.campaigns.some((c) => c.id === camp && c.kind === k)) setCamp(data.campaigns.find((c) => c.kind === k)?.id || "");
  }
  const first = (data.me.name || "").split(" ")[0];
  return (
    <div className="cc-app cc-homeapp">
      <div className="cc-top">
        <div className="cc-home-h">
          <div>
            <div className="cc-home-hi">{first ? `Hi, ${first}` : "App"}</div>
            <div className="cc-home-sub">{dueNow ? `${dueNow} call back${dueNow === 1 ? "" : "s"} due now` : data.review.length ? `${data.review.length} client-signed agreement${data.review.length === 1 ? "" : "s"} to review` : `${data.open.length} open`}</div>
          </div>
          <a className="cc-home-link" href="/dashboard">Dashboard</a>
        </div>
        <input className="cc-field cc-search" type="search" inputMode="search" placeholder="Search name, phone or lead number" aria-label="Search files" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {results === null && (
        <nav className="cc-tabs" aria-label="Lists">
          {tabs.map(([k, label]) => (
            <button key={k} className={`cc-tab${tab === k ? " cc-on" : ""}`} onClick={() => setTab(k)}>
              {label}{lists[k].length ? ` ${lists[k].length}` : ""}
            </button>
          ))}
        </nav>
      )}
      <main className="cc-main" style={{ gap: 12 }}>
        {results === null && tab === "review" && <div className="cc-cue" style={{ marginTop: 0 }}>
          The client signed, but the office signer and final certificate are still pending. Open each file, review the client-signed preview, then record the review before completing or correcting it.
        </div>}
        {results === null && tab === "done" && <div className="cc-cue" style={{ marginTop: 0 }}>
          These calls ended, but their files may still be open. Tap a file to keep working; the call history stays on the file.
        </div>}
        {data.notes.map((n, i) => <div key={i} className="cc-stop"><div className="cc-cue cc-red" style={{ marginTop: 0 }}>{n}</div></div>)}
        {data.setup.map((s) => (
          <div key={s.campaignId} className="cc-card">
            <span className="cc-card-h">E-sign for {s.name}</span>
            <div className="cc-cue" style={{ marginTop: 0 }}>
              {s.docuseal ? `${s.have} of ${s.need} agreements are set up in DocuSeal. One tap makes the rest.` : "DocuSeal is not connected. Add DOCUSEAL_API_KEY in Cloudflare first."}
            </div>
            {s.docuseal && <button className="cc-btn cc-full" onClick={() => setupEsign(s.campaignId)}>Set up agreements</button>}
            {setupMsg[s.campaignId] && <div className="cc-cue">{setupMsg[s.campaignId]}</div>}
          </div>
        ))}

        {results !== null ? (
          <>
            {searchErr && <div className="cc-cue cc-red">{searchErr}</div>}
            {!searchErr && results.length === 0 && <div className="cc-cue" style={{ textAlign: "center", marginTop: 24 }}>Nothing matches that.</div>}
            {results.length > 0 && (
              <div className="cc-grp">
                {results.map((r) => (
                  <a key={r.id} className="cc-lrow" href={`/app/${r.id}`}>
                    <span className="cc-lrow-main"><span className="cc-lrow-n">{r.claimant_name || "No name yet"}</span><span className="cc-lrow-s">{[fmtPhone(r.phone), r.lead_no, r.campaign].filter(Boolean).join("  ")}</span></span>
                    <span className="cc-lrow-t">{r.archived_at ? "Archived" : statusText(r.status)}</span>
                  </a>
                ))}
              </div>
            )}
          </>
        ) : rows.length === 0 ? (
          <div className="cc-cue" style={{ textAlign: "center", marginTop: 28 }}>
            {tab === "open" ? "No open files. New calls show up here." : tab === "review" ? "No client-signed agreements need review." : tab === "callbacks" ? "No call backs scheduled." : tab === "texts" ? "No texts in the last three days." : tab === "waiting" ? "Nothing out for signature." : "No calls ended in the last two days."}
          </div>
        ) : (
          <div className="cc-grp">
            {rows.map((r, i) => {
              const late = tab === "callbacks" && r.due && Date.parse(r.due) <= now;
              return (
                <a key={r.href || r.id + i} className="cc-lrow" href={r.href || (r.id ? `/app/${r.id}` : "#")}
                  onClick={(ev) => { if (r.newPhone) { ev.preventDefault(); setPhone(r.newPhone); setName(""); setErr(""); setSheet(true); } }}>
                  <span className="cc-lrow-main">
                    <span className="cc-lrow-n">{r.name || fmtPhone(r.phone) || "No name yet"}</span>
                    <span className="cc-lrow-s">{[r.name ? fmtPhone(r.phone) : "", r.sub].filter(Boolean).join("  ")}</span>
                  </span>
                  <span className={`cc-lrow-t${late ? " cc-late" : ""}`}>
                    {tab === "callbacks" ? (late ? `Due ${ago(r.due, now)}` : clock(r.due)) : tab === "texts" ? ago(r.at, now) : <><b>{r.tag}</b><br />{ago(r.at, now)}</>}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </main>
      <div className="cc-bar">
        <button className="cc-btn cc-go" onClick={() => { setSheet(true); setErr(""); }}>New call</button>
      </div>

      {sheet && (
        <div className="cc-scrim" onClick={(e) => { if (e.target === e.currentTarget) setSheet(false); }}>
          <div className="cc-sheet" role="dialog" aria-label="New call" style={{ height: "auto", maxHeight: "86%" }}>
            <div className="cc-grab"></div>
            <div className="cc-sheet-h"><span className="cc-card-h">New call</span><button className="cc-x" onClick={() => setSheet(false)}>Close</button></div>
            <div className="cc-sheet-b" style={{ gap: 10, paddingBottom: 28 }}>
              <div className="cc-sec-h" style={{ paddingTop: 0 }}>What kind of call?</div>
              <div className="cc-grp">
                {(kinds.length ? kinds : APP_KINDS).map((k, i, all) => (
                  <button key={k.key} className={`cc-drow${kind === k.key ? " cc-on" : ""}${i === all.length - 1 ? " cc-end" : ""}`} onClick={() => pickKind(k.key)}>
                    <span>{k.label}</span>
                    {kind === k.key && <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#16324F"></circle><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"></path></svg>}
                  </button>
                ))}
              </div>
              {/* The attorney the case signs with. TMP is the only one today. */}
              <div className="cc-sec-h">Attorney</div>
              <div className="cc-grp">
                {lines.map((c, i) => (
                  <button key={c.id} className={`cc-drow${camp === c.id ? " cc-on" : ""}${i === lines.length - 1 ? " cc-end" : ""}`} onClick={() => setCamp(c.id)}>
                    <span>{c.firm || c.name}</span>
                    {camp === c.id && <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#16324F"></circle><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"></path></svg>}
                  </button>
                ))}
                {lines.length === 0 && <div className="cc-drow cc-end"><span className="cc-cue" style={{ marginTop: 0 }}>No attorney is set up for this kind of call.</span></div>}
              </div>
              {data.campaigns.length === 0 && <div className="cc-cue cc-red">No active car accident campaign. An admin turns one on in Settings.</div>}
              <div className="cc-sec-h">Caller</div>
              <input className="cc-field" type="tel" inputMode="tel" placeholder="Phone number" aria-label="Caller phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input className="cc-field" type="text" placeholder="Name, if you have it" aria-label="Caller name" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="cc-cue" style={{ marginTop: 0 }}>If this number already has an open file on this line, that file opens.</div>
              {err && <div className="cc-cue cc-red">{err}</div>}
              <button className="cc-btn cc-full" disabled={busy || !camp} onClick={startCall}>{busy ? "Opening" : "Start the call"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
