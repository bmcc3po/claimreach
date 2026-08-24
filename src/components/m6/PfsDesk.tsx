"use client";
import { useState } from "react";
import Link from "next/link";

export default function PfsDesk({
  form, canImport,
}: {
  form: { name: string; question_count: number; updated_at: string | null } | null;
  canImport: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [count, setCount] = useState<number | null>(form?.question_count ?? null);

  async function onFile(file: File | null) {
    if (!file) return;
    setErr(""); setMsg("");
    const csv = await file.text();
    setBusy(true);
    try {
      const r = await fetch("/api/m6/pfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "import", csv, name: file.name.replace(/\.csv$/i, "") }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { setErr(d.error || "That file did not import."); return; }
      setCount(d.count ?? null);
      setMsg(`Saved ${d.count} questions. They are on every Motel 6 file now.`);
    } catch {
      setErr("Could not import. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const empty = count == null && !form;

  return (
    <>
      {empty ? (
        <section className="m6-card">
          <h2>No fact sheet yet</h2>
          <p>Import the judge&apos;s questions as a CSV. After that, agents fill them on the file and you can download the answers.</p>
          <p className="m6-hint">
            First row can be <code>question,type,section,options</code>. Or just one question per line.
          </p>
        </section>
      ) : (
        <section className="m6-card">
          <h2>{form?.name || "Plaintiff fact sheet"}</h2>
          <p>{count ?? form?.question_count} questions. Open a file to fill them in.</p>
          <div className="m6-file-acts" style={{ marginTop: 12 }}>
            <Link href="/m6/cases" className="m6-btn primary">Open a file</Link>
            <a className="m6-btn" href="/api/m6/pfs?export=1">Download all answers</a>
          </div>
        </section>
      )}

      {canImport && (
        <section className="m6-card">
          <h2>{empty ? "Import the sheet" : "Replace the sheet"}</h2>
          <p className="m6-hint">Answers already on files stay. New questions show as blank until someone fills them.</p>
          <label className="m6-field">
            <span>CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {busy && <p className="m6-hint">Saving…</p>}
          {msg && <p>{msg}</p>}
          {err && <p className="m6-error">{err}</p>}
        </section>
      )}

      {!canImport && empty && (
        <section className="m6-card">
          <p>Ask Innovative to import the judge&apos;s list. Until then this page stays empty on purpose.</p>
        </section>
      )}
    </>
  );
}
