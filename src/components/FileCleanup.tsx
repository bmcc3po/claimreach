"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FileNavigation from "./FileNavigation";
import "./file-cleanup.css";

export type CleanupRow = { id: string; leadNo: string; name: string; campaign: string; firm: string; archivedAt: string | null; reason: string; test: boolean };

export default function FileCleanup({ rows }: { rows: CleanupRow[] }) {
  const router = useRouter();
  const [view, setView] = useState<"tests" | "archive">("tests");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Record<string, string | null>>({});
  useEffect(() => { setPending({}); }, [rows]);
  const current = rows.map(r => r.id in pending ? { ...r, archivedAt: pending[r.id] } : r);
  const tests = current.filter(r => r.test && !r.archivedAt);
  const archived = current.filter(r => !!r.archivedAt);
  const visible = (view === "tests" ? tests : archived).filter(r =>
    [r.name, r.leadNo, r.campaign, r.firm].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const chosen = visible.filter(r => selected.includes(r.id));
  function changeView(next: "tests" | "archive") {
    setView(next); setSelected([]); setConfirming(false); setError(""); setMessage("");
  }
  async function save() {
    if (busy || !chosen.length) return;
    setBusy(true); setError(""); setMessage("");
    const restoring = view === "archive";
    const ids = chosen.map(r => r.id);
    try {
      const response = await fetch("/api/leads/bulk", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: restoring ? "restore" : "archive", ids, ...(!restoring ? { reason: "Test file cleanup — selected by owner" } : {}) }) });
      const data = await response.json();
      if (!response.ok || !data.ok || data.count !== ids.length) throw new Error(data.error || "The update could not be confirmed. Refresh and check the selected files.");
      setPending(old => ({ ...old, ...Object.fromEntries(ids.map(id => [id, restoring ? null : new Date().toISOString()])) }));
      setSelected([]); setConfirming(false);
      setMessage(`${ids.length} file${ids.length === 1 ? "" : "s"} ${restoring ? "restored." : "archived. Removed from active lists, reports, searches and delivery counts."}`);
      router.refresh();
    } catch (e: any) { setError(e.message || "Could not reach the server. Refresh and check the selected files before retrying."); }
    finally { setBusy(false); }
  }
  return <main className="file-cleanup">
    <FileNavigation />
    <h1>Test files & archive</h1>
    <p>Clear test files out of everyday work. Keep the records, documents and history.</p>
    <nav aria-label="Cleanup views">
      <button disabled={busy} aria-pressed={view === "tests"} onClick={() => changeView("tests")}>Test files ({tests.length})</button>
      <button disabled={busy} aria-pressed={view === "archive"} onClick={() => changeView("archive")}>Archived files ({archived.length})</button>
    </nav>
    <label className="fc-search">Find a file<input type="search" value={query} disabled={busy} placeholder="Name, lead number, campaign or firm"
      onChange={e => { setQuery(e.target.value); setSelected([]); setConfirming(false); }} /></label>
    {view === "tests" && <p className="fc-hint">Suggested from TEST / NONBINDING names or rehearsal settings. Check the names before archiving. Other files can be archived from their file screen.</p>}
    <div className="fc-actions">
      <label><input type="checkbox" disabled={busy || !visible.length} aria-label="Select all shown files" checked={!!visible.length && chosen.length === visible.length}
        onChange={e => { setSelected(e.target.checked ? visible.map(r => r.id) : []); setConfirming(false); }} /> Select shown ({visible.length})</label>
      <button disabled={busy || !chosen.length} onClick={() => { setConfirming(true); setError(""); }}>{view === "tests" ? "Archive" : "Restore"} selected ({chosen.length})</button>
    </div>
    {confirming && <section className="fc-confirm" role="dialog" aria-label={view === "tests" ? "Confirm archive" : "Confirm restore"}>
      <h2>{view === "tests" ? "Archive" : "Restore"} {chosen.length} {chosen.length === 1 ? "file" : "files"}?</h2>
      <p>{view === "tests" ? "They will leave active lists, dashboard counts, reports and search. Each file and all its matters remain recoverable here." : "These files and all their matters will return to active lists and counts."}</p>
      <ul>{chosen.map(r => <li key={r.id}>{r.leadNo} · {r.name}</li>)}</ul>
      <button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : view === "tests" ? "Confirm archive" : "Confirm restore"}</button>
      <button disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
    </section>}
    {error && <p role="alert" className="fc-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    <div className="fc-list">
      {visible.map(r => <label className="fc-row" key={r.id}>
        <input type="checkbox" disabled={busy} aria-label={"Select " + r.leadNo} checked={selected.includes(r.id)}
          onChange={e => { setSelected(old => e.target.checked ? [...old, r.id] : old.filter(id => id !== r.id)); setConfirming(false); }} />
        <span><a href={"/leads/" + encodeURIComponent(r.id)}>{r.name}</a><small>{r.leadNo} · {r.campaign} · {r.firm}</small>
          {r.archivedAt && <small>Archived {new Date(r.archivedAt).toLocaleDateString("en-US")}{r.reason ? " · " + r.reason : ""}</small>}</span>
        <b>{r.test ? "Test" : "Archived"}</b>
      </label>)}
      {!visible.length && <p>{query ? "No files match your search." : view === "tests" ? "No active test files to clean up." : "No archived files."}</p>}
    </div>
  </main>;
}
