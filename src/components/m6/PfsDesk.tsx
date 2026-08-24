"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Field } from "@/lib/questionnaire";
import { PFS_ASK_KINDS, pfsKindLabel, pfsListRows, pfsSectionOf } from "@/lib/pfs";

type FormInfo = {
  name: string;
  question_count: number;
  updated_at: string | null;
  fields: Field[];
};

type Draft = {
  id?: string;
  label: string;
  kind: string;
  section: string;
  optionsText: string;
};

const blankDraft = (): Draft => ({ label: "", kind: "longtext", section: "", optionsText: "" });

function needsOptions(kind: string) {
  return kind === "select" || kind === "multiselect";
}

export default function PfsDesk({
  form, canImport,
}: {
  form: FormInfo | null;
  canImport: boolean;
}) {
  const [fields, setFields] = useState<Field[]>(form?.fields ?? []);
  const [name] = useState(form?.name || "Plaintiff fact sheet");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [panel, setPanel] = useState<"none" | "add" | "import">(form?.fields?.length ? "none" : "none");
  const [draft, setDraft] = useState<Draft>(blankDraft());

  const rows = useMemo(() => pfsListRows(fields), [fields]);
  const empty = rows.length === 0;
  const choice = needsOptions(draft.kind);

  function applyFields(next: Field[] | undefined, okMsg?: string) {
    if (Array.isArray(next)) setFields(next);
    if (okMsg) setMsg(okMsg);
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setErr(""); setMsg("");
    const csv = await file.text();
    setBusy("import");
    try {
      const r = await fetch("/api/m6/pfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "import", csv, name: file.name.replace(/\.csv$/i, "") }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { setErr(d.error || "That file did not import."); return; }
      applyFields(d.fields, `Saved ${d.count} questions. They are on every Motel 6 file now.`);
      setPanel("none");
    } catch {
      setErr("Could not import. Check your connection.");
    } finally {
      setBusy("");
    }
  }

  async function saveQuestion() {
    setErr(""); setMsg("");
    setBusy("save");
    const options = draft.optionsText.split("\n").map((s) => s.trim()).filter(Boolean);
    try {
      const r = await fetch("/api/m6/pfs", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft.id ? {
          id: draft.id,
          label: draft.label,
          kind: draft.kind,
          section: draft.section,
          options,
        } : {
          op: "add",
          label: draft.label,
          kind: draft.kind,
          section: draft.section,
          options,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { setErr(d.error || "That did not save."); return; }
      applyFields(d.fields, draft.id ? "Question saved." : "Question added. It is on every Motel 6 file now.");
      setDraft(blankDraft());
      setPanel("none");
    } catch {
      setErr("That did not save. Check your connection.");
    } finally {
      setBusy("");
    }
  }

  async function move(id: string, dir: -1 | 1) {
    setErr(""); setMsg("");
    setBusy(`move-${id}`);
    try {
      const r = await fetch("/api/m6/pfs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, dir }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { setErr(d.error || "Could not reorder."); return; }
      applyFields(d.fields);
    } catch {
      setErr("Could not reorder. Check your connection.");
    } finally {
      setBusy("");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this question? Answers already on files stay.")) return;
    setErr(""); setMsg("");
    setBusy(`del-${id}`);
    try {
      const r = await fetch("/api/m6/pfs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { setErr(d.error || "Could not delete."); return; }
      applyFields(d.fields, "Question removed. Answers already on files stay.");
      if (draft.id === id) { setDraft(blankDraft()); setPanel("none"); }
    } catch {
      setErr("Could not delete. Check your connection.");
    } finally {
      setBusy("");
    }
  }

  function startAdd() {
    setErr(""); setMsg("");
    setDraft(blankDraft());
    setPanel("add");
  }

  function startEdit(f: Field) {
    setErr(""); setMsg("");
    setDraft({
      id: f.id,
      label: f.label,
      kind: f.kind,
      section: pfsSectionOf(fields, f.id),
      optionsText: (f.options ?? []).join("\n"),
    });
    setPanel("add");
  }

  const formCard = (
    <section className="m6-card">
      <h2>{draft.id ? "Edit question" : "Add a question"}</h2>
      <p className="m6-hint">Same types as the ClaimReach builder. Answers already on files stay.</p>
      <label className="m6-field">
        <span>Question</span>
        <textarea
          className="m6-textarea"
          rows={3}
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          placeholder="What the judge asked"
        />
      </label>
      <label className="m6-field">
        <span>Type</span>
        <select value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}>
          {PFS_ASK_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>{k.label}</option>
          ))}
        </select>
      </label>
      <label className="m6-field">
        <span>Section</span>
        <input
          value={draft.section}
          onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value }))}
          placeholder="Optional — e.g. Stay"
        />
      </label>
      {choice && (
        <label className="m6-field">
          <span>Choices (one per line)</span>
          <textarea
            className="m6-textarea"
            rows={4}
            value={draft.optionsText}
            onChange={(e) => setDraft((d) => ({ ...d, optionsText: e.target.value }))}
            placeholder={"Motel 6\nStudio 6"}
          />
        </label>
      )}
      <div className="m6-desk-acts">
        <button type="button" className="m6-btn primary" disabled={!!busy || !draft.label.trim()} onClick={() => void saveQuestion()}>
          {busy === "save" ? "Saving…" : draft.id ? "Save question" : "Add question"}
        </button>
        <button type="button" className="m6-btn" disabled={!!busy} onClick={() => { setPanel("none"); setDraft(blankDraft()); }}>
          Cancel
        </button>
      </div>
    </section>
  );

  const importCard = (
    <section className="m6-card">
      <h2>{empty ? "Import CSV" : "Import more"}</h2>
      <p className="m6-hint">
        First row can be <code>question, type, section, options</code>. Or one question per line.
        New questions show blank on files. Answers already there stay.
      </p>
      <label className="m6-field">
        <span>CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={!!busy}
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {busy === "import" && <p className="m6-hint">Saving…</p>}
      <button type="button" className="m6-btn" disabled={!!busy} onClick={() => setPanel("none")}>
        Cancel
      </button>
    </section>
  );

  return (
    <>
      {empty ? (
        <section className="m6-card">
          <h2>No fact sheet yet</h2>
          <p>Import the judge&apos;s sheet, or add one question at a time. Answers already on files stay.</p>
        </section>
      ) : (
        <section className="m6-card">
          <h2>{name}</h2>
          <p>{rows.length} questions. Open a file to fill them in.</p>
          <div className="m6-desk-acts" style={{ marginTop: 12 }}>
            <Link href="/m6/cases" className="m6-btn primary">Open a file</Link>
            <a className="m6-btn" href="/api/m6/pfs?export=1">Download all answers</a>
          </div>
        </section>
      )}

      {canImport && empty && panel === "none" && (
        <div className="m6-paths">
          <button type="button" className="m6-path" onClick={() => setPanel("import")}>
            <strong>Import CSV</strong>
            <span>Drop in the judge&apos;s list. First row can name the columns.</span>
          </button>
          <button type="button" className="m6-path" onClick={startAdd}>
            <strong>Add a question</strong>
            <span>Type, section, and choices — same as the staff builder.</span>
          </button>
        </div>
      )}

      {canImport && !empty && panel === "none" && (
        <div className="m6-desk-acts">
          <button type="button" className="m6-btn primary" onClick={startAdd}>Add a question</button>
          <button type="button" className="m6-btn" onClick={() => setPanel("import")}>Import CSV</button>
        </div>
      )}

      {canImport && panel === "add" && formCard}
      {canImport && panel === "import" && importCard}

      {!empty && (
        <section className="m6-card">
          <h2>Questions</h2>
          <ul className="m6-q-list">
            {rows.map(({ field, section }, i) => (
              <li key={field.id} className="m6-q-row">
                <div className="m6-q-main">
                  <span className="m6-q-meta">
                    {section || "No section"} · {pfsKindLabel(field.kind)}
                  </span>
                  <strong>{field.label}</strong>
                </div>
                {canImport && (
                  <div className="m6-q-tools">
                    <button type="button" className="m6-btn sm" disabled={!!busy || i === 0} onClick={() => void move(field.id, -1)}>↑</button>
                    <button type="button" className="m6-btn sm" disabled={!!busy || i === rows.length - 1} onClick={() => void move(field.id, 1)}>↓</button>
                    <button type="button" className="m6-btn sm" disabled={!!busy} onClick={() => startEdit(field)}>Edit</button>
                    <button type="button" className="m6-btn sm" disabled={!!busy} onClick={() => void remove(field.id)}>Delete</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {msg && <p className="m6-ok">{msg}</p>}
      {err && <p className="m6-error">{err}</p>}

      {!canImport && empty && (
        <section className="m6-card">
          <p>Ask Innovative to import the judge&apos;s list or add the first question. Until then this page stays empty on purpose.</p>
        </section>
      )}
    </>
  );
}
