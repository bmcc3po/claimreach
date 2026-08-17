"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  HEALTH_LABEL, OUTCOMES, PURPOSES, POINT_KINDS,
  daysAgo, dueWording, displayName, type Health,
} from "@/lib/m6";

type Point = {
  id: string; kind: string; value: string; label: string | null;
  status: string; is_primary: boolean; person_name: string | null;
  relationship: string | null; permission_to_discuss: boolean | null;
  contact_script: string | null; platform: string | null;
  verified_at: string | null; last_success_at: string | null;
};

export default function CaseFile({
  lead, status, points, notes, comms, schedule, docs, users,
}: {
  lead: any; status: any; points: Point[];
  notes: any[]; comms: any[]; schedule: any[]; docs: any[]; users: any[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  const health: Health = (status?.health ?? "green") as Health;
  const name = displayName(lead);
  const addr = [lead.mail_addr1, lead.mail_city, lead.mail_state, lead.mail_zip].filter(Boolean).join(", ");

  async function post(url: string, body: any, label: string) {
    setBusy(label); setErr("");
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, ...body }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { setErr(d.error || "That did not save. Try again."); return false; }
      router.refresh();
      return true;
    } catch {
      setErr("That did not save. Check your connection and try again.");
      return false;
    } finally {
      setBusy("");
    }
  }

  const live = points.filter((p) => p.status !== "dead");
  const dead = points.filter((p) => p.status === "dead");

  return (
    <div className="m6-page m6-file">
      {/* ---- header ------------------------------------------------------ */}
      <div className="m6-file-head">
        <div>
          <Link href="/m6/cases" className="m6-back">Cases</Link>
          <h1>{name}</h1>
          <p className="m6-sub">
            {lead.lead_no}
            {lead.dob && ` · born ${lead.dob}`}
            {lead.lawruler_url && (
              <> · <a href={lead.lawruler_url} target="_blank" rel="noreferrer">Open in LawRuler</a></>
            )}
          </p>
        </div>
        <button className="m6-btn primary" onClick={() => setLogOpen(true)}>
          Log a touch
        </button>
      </div>

      {lead.comms_monitored && (
        <p className="m6-warn">
          Communications may be monitored. No voicemail, nothing identifying in a
          text, and follow the approved script with anyone else who answers.
        </p>
      )}
      {err && <p className="m6-error">{err}</p>}

      {/* ---- contact health ---------------------------------------------- */}
      <section className={`m6-health ${health}`}>
        <div className="m6-health-top">
          <span className={`m6-dot ${health}`} aria-hidden="true" />
          <strong>{HEALTH_LABEL[health]}</strong>
          {status?.ladder_step && <span className="m6-step">Ladder step {status.ladder_step}</span>}
        </div>
        <dl className="m6-health-facts">
          <div><dt>Last reached</dt><dd>{daysAgo(status?.last_two_way_at)}</dd></div>
          <div><dt>Next check-in</dt><dd>{dueWording(status?.next_touch_due)}</dd></div>
          <div><dt>Ways to reach them</dt><dd>{live.length}</dd></div>
        </dl>
        <div className="m6-health-acts">
          <button
            className="m6-btn"
            disabled={!!busy}
            onClick={() => post("/api/m6/touch", { outcome: "two_way", purpose: "ad_hoc", channel: "call" }, "verify")}
          >
            {busy === "verify" ? "Saving" : "I reached them just now"}
          </button>
          <button
            className="m6-btn"
            disabled={!!busy}
            onClick={() => {
              const d = prompt("Schedule the next call for which date? (YYYY-MM-DD)");
              if (d) post("/api/m6/schedule", { due_at: d, kind: "callback" }, "sched");
            }}
          >
            Schedule a call
          </button>
        </div>
      </section>

      <div className="m6-cols">
        <div className="m6-col">
          {/* ---- contact web -------------------------------------------- */}
          <section className="m6-card">
            <div className="m6-card-head">
              <h2>How to reach them</h2>
              <button
                className="m6-btn sm"
                onClick={() => {
                  const kind = prompt(`Kind? ${POINT_KINDS.map((k) => k.value).join(", ")}`);
                  if (!kind) return;
                  const value = prompt("Number, email, handle, or address");
                  if (!value) return;
                  const label = prompt("Label it (mom, second number, work)") || "";
                  post("/api/m6/contact-point", { kind, value, label }, "point");
                }}
              >
                Add
              </button>
            </div>
            {live.length === 0 ? (
              <p className="m6-empty">
                No way to reach this person is on file. Add a number, an email, or
                someone who can get a message to them.
              </p>
            ) : (
              <ul className="m6-points">
                {live.map((p) => (
                  <li key={p.id} className={p.status === "shaky" ? "shaky" : ""}>
                    <div className="m6-point-main">
                      <span className="m6-point-val">{p.value}</span>
                      <span className="m6-point-lab">
                        {p.label || p.kind}
                        {p.person_name && ` · ${p.person_name}`}
                        {p.relationship && ` (${p.relationship})`}
                        {p.permission_to_discuss === false && " · do not discuss the case"}
                      </span>
                      {p.contact_script && <p className="m6-script">{p.contact_script}</p>}
                    </div>
                    <button
                      className="m6-linkbtn"
                      onClick={() => post("/api/m6/contact-point", { id: p.id, status: "dead" }, "kill")}
                    >
                      Mark dead
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {dead.length > 0 && (
              <details className="m6-dead">
                <summary>{dead.length} dead {dead.length === 1 ? "number" : "numbers"}</summary>
                <ul>{dead.map((p) => <li key={p.id}>{p.value} · {p.label || p.kind}</li>)}</ul>
                <p className="m6-hint">Kept on purpose. A dead number is a starting point for a skip trace.</p>
              </details>
            )}
          </section>

          {/* ---- scheduled ------------------------------------------------ */}
          {schedule.length > 0 && (
            <section className="m6-card">
              <h2>Scheduled</h2>
              <ul className="m6-sched">
                {schedule.map((s) => (
                  <li key={s.id}>
                    <strong>{new Date(s.due_at).toLocaleDateString()}</strong>
                    <span>{s.kind}{s.assigned_name ? ` · ${s.assigned_name}` : " · unclaimed"}</span>
                    {s.note && <em>{s.note}</em>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ---- documents ------------------------------------------------ */}
          <section className="m6-card">
            <h2>Documents</h2>
            {docs.length === 0 ? (
              <p className="m6-empty">Nothing has come over from LawRuler yet.</p>
            ) : (
              <ul className="m6-docs">
                {docs.map((d) => (
                  <li key={d.id}>
                    <span>{d.file_name}</span>
                    <span className="m6-hint">{d.doc_type}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="m6-col">
          {/* ---- notes ---------------------------------------------------- */}
          <section className="m6-card">
            <h2>Notes</h2>
            <p className="m6-hint">Both Innovative and Turnbull see everything here.</p>
            <textarea
              className="m6-textarea"
              rows={3}
              placeholder="What happened, what she needs, when to call back"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <button
              className="m6-btn"
              disabled={!noteText.trim() || !!busy}
              onClick={async () => {
                const ok = await post("/api/m6/note", { body: noteText.trim() }, "note");
                if (ok) setNoteText("");
              }}
            >
              {busy === "note" ? "Saving" : "Add note"}
            </button>

            {lead.case_description && (
              <div className="m6-narrative">
                <h3>From intake</h3>
                <p>{lead.case_description}</p>
              </div>
            )}

            <ul className="m6-notes">
              {notes.map((n) => (
                <li key={n.id}>
                  <div className="m6-note-meta">
                    {n.author_name ?? "System"} · {new Date(n.created_at).toLocaleString()}
                  </div>
                  <p>{n.body}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* ---- history -------------------------------------------------- */}
          <section className="m6-card">
            <h2>Contact history</h2>
            {comms.length === 0 ? (
              <p className="m6-empty">No calls or texts logged yet.</p>
            ) : (
              <ul className="m6-comms">
                {comms.map((c) => (
                  <li key={c.id} className={c.outcome === "two_way" ? "hit" : ""}>
                    <span className="m6-comm-when">
                      {c.occurred_at ? new Date(c.occurred_at).toLocaleDateString() : "—"}
                    </span>
                    <span className="m6-comm-what">
                      {c.channel === "sms" ? "Text" : "Call"}
                      {c.direction === "inbound" ? " in" : " out"}
                      {c.outcome && ` · ${OUTCOMES.find((o) => o.value === c.outcome)?.label ?? c.outcome}`}
                      {c.agent_name && ` · ${c.agent_name}`}
                    </span>
                    {c.body && <span className="m6-comm-body">{c.body}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {logOpen && (
        <LogTouch
          onClose={() => setLogOpen(false)}
          points={live}
          onSave={async (body) => {
            const ok = await post("/api/m6/touch", body, "touch");
            if (ok) setLogOpen(false);
          }}
          busy={busy === "touch"}
        />
      )}
    </div>
  );
}

// Two taps and out. Anything longer and people stop logging, and the moment
// logging slips the health number becomes a lie nobody trusts.
function LogTouch({
  onClose, onSave, points, busy,
}: {
  onClose: () => void;
  onSave: (b: any) => void;
  points: Point[];
  busy: boolean;
}) {
  const [purpose, setPurpose] = useState("heartbeat");
  const [channel, setChannel] = useState("call");
  const [pointId, setPointId] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="m6-modal-wrap" role="dialog" aria-modal="true" aria-label="Log a touch">
      <div className="m6-modal">
        <div className="m6-modal-head">
          <h2>Log a touch</h2>
          <button className="m6-linkbtn" onClick={onClose}>Close</button>
        </div>

        <label className="m6-field">
          <span>Why</span>
          <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>

        <label className="m6-field">
          <span>How</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="call">Call</option>
            <option value="sms">Text</option>
          </select>
        </label>

        {points.length > 0 && (
          <label className="m6-field">
            <span>Which contact point</span>
            <select value={pointId} onChange={(e) => setPointId(e.target.value)}>
              <option value="">Not sure</option>
              {points.map((p) => (
                <option key={p.id} value={p.id}>{p.value} · {p.label || p.kind}</option>
              ))}
            </select>
          </label>
        )}

        <label className="m6-field">
          <span>Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Call after 6" />
        </label>

        <p className="m6-hint">How did it end? This is what moves the clock.</p>
        <div className="m6-outcomes">
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              className={`m6-outcome ${o.value}`}
              disabled={busy}
              onClick={() => onSave({
                outcome: o.value, purpose, channel,
                contact_point_id: pointId || null,
                body: note || null,
              })}
            >
              <strong>{o.label}</strong>
              <span>{o.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
