"use client";
import { useState } from "react";
import type { NoteSuggestion } from "@/lib/netfly-note-suggestions";
export default function NotesAssist({ fileKey, notes, saveNotes, onApplied }: {
  fileKey: string; notes: string; saveNotes: () => Promise<boolean>; onApplied: (fields: Record<string, string>) => void;
}) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [proposal, setProposal] = useState<{ notes: string; rows: NoteSuggestion[] } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  async function request(op: "suggest" | "apply") {
    setBusy(true); setMessage("");
    const controller = new AbortController();
    const timer = op === "suggest" ? setTimeout(() => controller.abort(), 30000) : null;
    try {
      if (op === "suggest" && !await saveNotes()) return;
      if (controller.signal.aborted) throw new Error("Saving took longer than expected. Your notes remain here; retry Fill from notes.");
      const response = await fetch("/api/netfly/notes", { method: "POST", headers: { "Content-Type": "application/json" },
        ...(op === "suggest" ? { signal: controller.signal } : {}),
        body: JSON.stringify({ op, file: fileKey, notes: op === "apply" ? proposal?.notes : notes,
          suggestions: proposal?.rows.filter(row => selected.includes(row.id)) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not fill from notes.");
      if (op === "suggest") { setProposal({ notes, rows: data.suggestions }); setSelected(data.suggestions.map((row: NoteSuggestion) => row.id)); if (!data.suggestions.length) setMessage("No new answers found. Existing answers stay as they are."); }
      else { onApplied(Object.fromEntries(data.applied.map((id: string) => [id, data.fields[id]]))); setProposal(null); setMessage(data.applied.length + " answers filled. Existing answers kept."); }
    } catch (error: any) { setMessage(error.name === "AbortError" ? "The helper took too long. Your notes are saved; try again or keep using the quick choices." : error.message); }
    finally { if (timer) clearTimeout(timer); setBusy(false); }
  }
  const fresh = proposal?.notes === notes;
  return <div className="nf-notes-assist"><button type="button" className="nf-secondary" disabled={busy || notes.trim().length < 10} onClick={() => void request("suggest")}>{busy ? "Working…" : "Fill from notes"}</button>
    {message && <p role="status">{message}</p>}
    {proposal && proposal.rows.length > 0 && <div className="nf-notes-preview"><strong>Quick check—does this look right?</strong>
      <p className="nf-muted">Only fills blank answers. Uncheck anything you don’t want.</p>
      {proposal.rows.map(row => <label className="nf-import-row" key={row.id}><input type="checkbox" disabled={busy || !fresh} checked={selected.includes(row.id)} onChange={e => setSelected(old => e.target.checked ? [...old, row.id] : old.filter(id => id !== row.id))} /><span><strong>{row.label}</strong>{row.value}<small>From your notes: “{row.evidence}”</small></span></label>)}
      {!fresh && <p role="status">Notes changed. Click Fill from notes to refresh.</p>}
      <button type="button" className="nf-primary" disabled={busy || !fresh || !selected.length} onClick={() => void request("apply")}>Use {selected.length} answers</button>
      <button type="button" className="nf-text-action" disabled={busy} onClick={() => setProposal(null)}>Dismiss</button>
    </div>}
  </div>;
}

