"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PhoneInput from "@/components/PhoneInput";
import {
  HEALTH_LABEL, OUTCOMES, PURPOSES, POINT_KINDS, SOCIAL_PLATFORMS,
  LOR_STATUSES, LOR_SENT_TO, lorShowsOnToday,
  daysAgo, dueWording, displayName, formatLocalDateTime, formatLocalDate,
  dueAtFromDateInput, SECONDARY_INTERVIEW_DOC_TYPE, type Health,
} from "@/lib/m6";
import { stayRangeLabel, type IdentifiedProperty } from "@/lib/property-tool";

type Point = {
  id: string; kind: string; value: string; label: string | null;
  status: string; is_primary: boolean; person_name: string | null;
  relationship: string | null; permission_to_discuss: boolean | null;
  contact_script: string | null; platform: string | null;
  verified_at: string | null; last_success_at: string | null;
};

type Modal = "touch" | "sched" | "point" | null;

export default function CaseFile({
  lead, status, points, notes, comms, schedule, docs, lor, identified,
}: {
  lead: any; status: any; points: Point[];
  notes: any[]; comms: any[]; schedule: any[]; docs: any[];
  lor: any;
  identified?: IdentifiedProperty[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [noteText, setNoteText] = useState("");
  const [lorStatus, setLorStatus] = useState(lor?.status ?? "not_sent");
  const [lorToday, setLorToday] = useState(!!lorShowsOnToday(lor));
  const [lorSentOn, setLorSentOn] = useState(lor?.sent_on ?? "");
  const [lorSentTo, setLorSentTo] = useState(lor?.sent_to ?? "");

  const health: Health = (status?.health ?? "green") as Health;
  const name = displayName(lead);
  const addr = [lead.mail_addr1, lead.mail_city, lead.mail_state, lead.mail_zip].filter(Boolean).join(", ");
  const interview = docs.find((d) => d.doc_type === SECONDARY_INTERVIEW_DOC_TYPE);

  useEffect(() => {
    setErr("");
    setModal(null);
    setBusy("");
  }, [lead.id]);

  async function post(url: string, body: any, label: string) {
    setBusy(label); setErr("");
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, ...body }),
      });
      const d = await r.json().catch(() => ({}));
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

  function openModal(kind: Modal) {
    setErr("");
    setModal(kind);
  }
  function closeModal() {
    setModal(null);
  }

  async function viewInterview(docId: string) {
    setBusy("interview");
    setErr("");
    try {
      const r = await fetch(
        `/api/m6/document?lead_id=${encodeURIComponent(lead.id)}&id=${encodeURIComponent(docId)}`,
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) {
        setErr(d.error || "Could not open the interview.");
        return;
      }
      window.open(d.url, "_blank", "noopener,noreferrer");
    } catch {
      setErr("Could not open the interview.");
    } finally {
      setBusy("");
    }
  }

  const live = points.filter((p) => p.status !== "dead");
  const dead = points.filter((p) => p.status === "dead");
  const pageErr = err && !modal;

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
            {addr && ` · ${addr}`}
            {lead.lawruler_url && (
              <> · <a href={lead.lawruler_url} target="_blank" rel="noreferrer">Open in LawRuler</a></>
            )}
          </p>
        </div>
        <div className="m6-file-acts">
          {interview && (
            <button
              type="button"
              className="m6-btn"
              disabled={!!busy}
              onClick={() => viewInterview(interview.id)}
            >
              {busy === "interview" ? "Opening" : "View secondary interview"}
            </button>
          )}
          <button type="button" className="m6-btn primary" onClick={() => openModal("touch")}>
            Log a touch
          </button>
        </div>
      </div>

      {lead.comms_monitored && (
        <p className="m6-warn">
          Communications may be monitored. No voicemail, nothing identifying in a
          text, and follow the approved script with anyone else who answers.
        </p>
      )}
      {pageErr && <p className="m6-error">{err}</p>}

      {/* ---- LOR -------------------------------------------------------- */}
      <section className="m6-card m6-lor">
        <h2>Letter of representation</h2>
        <div className="m6-lor-grid">
          <label className="m6-field">
            <span>Status</span>
            <select
              value={lorStatus}
              onChange={(e) => {
                const v = e.target.value;
                setLorStatus(v);
                if (v === "ready") setLorToday(true);
                if (v === "sent" || v === "received") setLorToday(false);
              }}
            >
              {LOR_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="m6-field">
            <span>Sent on</span>
            <input type="date" value={lorSentOn} onChange={(e) => setLorSentOn(e.target.value)} />
          </label>
          <label className="m6-field">
            <span>Sent to</span>
            <select value={lorSentTo} onChange={(e) => setLorSentTo(e.target.value)}>
              <option value="">Not yet</option>
              {LOR_SENT_TO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <label className="m6-check">
          <input
            type="checkbox"
            checked={lorToday}
            disabled={lorStatus === "sent" || lorStatus === "received"}
            onChange={(e) => setLorToday(e.target.checked)}
          />
          Show on Today
        </label>
        <button
          type="button"
          className="m6-btn"
          disabled={!!busy}
          onClick={() => post("/api/m6/lor", {
            status: lorStatus,
            flagged_today: lorToday,
            sent_on: lorSentOn || null,
            sent_to: lorSentTo || null,
          }, "lor")}
        >
          {busy === "lor" ? "Saving" : "Save LOR"}
        </button>
      </section>

      {!!identified?.length && (
        <section className="m6-card m6-identified">
          <h2>Identified properties</h2>
          <ul className="m6-points">
            {identified.map((p) => {
              const where = [p.street || p.address, p.city, p.state, p.zip].filter(Boolean).join(", ");
              const when = stayRangeLabel(p.stay_from, p.stay_to);
              return (
                <li key={p.id}>
                  <div>
                    <span className="m6-point-val">{p.name || "Property"}</span>
                    {where && <span className="m6-point-lab">{where}</span>}
                    <span className="m6-point-lab">
                      Remembered as {p.remembered_brand || "not noted"}
                      {p.current_brand ? ` · current flag ${p.current_brand}` : ""}
                      {when ? ` · ${when}` : ""}
                    </span>
                    {p.brand_mismatch && (
                      <span className="m6-id-flag">Remembered brand differs from the current flag</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
            type="button"
            className="m6-btn"
            disabled={!!busy}
            onClick={() => post("/api/m6/touch", { outcome: "two_way", purpose: "ad_hoc", channel: "call" }, "verify")}
          >
            {busy === "verify" ? "Saving" : "I reached them just now"}
          </button>
          <button
            type="button"
            className="m6-btn"
            disabled={!!busy}
            onClick={() => openModal("sched")}
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
              <button type="button" className="m6-btn sm" onClick={() => openModal("point")}>
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
                      type="button"
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
                    <strong>{formatLocalDate(s.due_at)}</strong>
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
          {/* ---- messages (lead_notes source=m6; not a second table) ------ */}
          <section className="m6-card">
            <h2>Messages</h2>
            <p className="m6-hint">Both Innovative and Turnbull see this thread.</p>
            <textarea
              className="m6-textarea"
              rows={3}
              placeholder="Write a message"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <button
              type="button"
              className="m6-btn"
              disabled={!noteText.trim() || !!busy}
              onClick={async () => {
                const ok = await post("/api/m6/note", { body: noteText.trim() }, "note");
                if (ok) setNoteText("");
              }}
            >
              {busy === "note" ? "Sending" : "Send"}
            </button>

            {notes.length === 0 ? (
              <p className="m6-empty">No messages yet.</p>
            ) : (
              <ul className="m6-notes">
                {notes.map((n) => (
                  <li key={n.id} className={n.author_side === "staff" ? "from-staff" : "from-firm"}>
                    <div className="m6-note-meta">
                      <strong>{n.author_name ?? "Someone"}</strong>
                      {" · "}
                      {n.author_side === "staff" ? "Innovative" : "Turnbull"}
                      {" · "}
                      {formatLocalDateTime(n.created_at)}
                    </div>
                    <p>{n.body}</p>
                  </li>
                ))}
              </ul>
            )}

            {lead.case_description && (
              <div className="m6-narrative">
                <h3>From intake</h3>
                <p>{lead.case_description}</p>
              </div>
            )}
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
                      {formatLocalDateTime(c.occurred_at)}
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

      {modal === "touch" && (
        <LogTouch
          err={err}
          onClose={closeModal}
          points={live}
          onSave={async (body) => {
            const ok = await post("/api/m6/touch", body, "touch");
            if (ok) closeModal();
          }}
          busy={busy === "touch"}
        />
      )}
      {modal === "sched" && (
        <ScheduleCall
          err={err}
          onClose={closeModal}
          onSave={async (body) => {
            const ok = await post("/api/m6/schedule", body, "sched");
            if (ok) closeModal();
          }}
          busy={busy === "sched"}
        />
      )}
      {modal === "point" && (
        <AddContact
          err={err}
          onClose={closeModal}
          onSave={async (body) => {
            const ok = await post("/api/m6/contact-point", body, "point");
            if (ok) closeModal();
          }}
          busy={busy === "point"}
        />
      )}
    </div>
  );
}

function ModalShell({
  title, onClose, err, children,
}: {
  title: string; onClose: () => void; err: string; children: ReactNode;
}) {
  return (
    <div className="m6-modal-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="m6-modal">
        <div className="m6-modal-head">
          <h2>{title}</h2>
          <button type="button" className="m6-linkbtn" onClick={onClose}>Close</button>
        </div>
        {err && <p className="m6-error">{err}</p>}
        {children}
      </div>
    </div>
  );
}

function LogTouch({
  onClose, onSave, points, busy, err,
}: {
  onClose: () => void;
  onSave: (b: any) => void;
  points: Point[];
  busy: boolean;
  err: string;
}) {
  const [purpose, setPurpose] = useState("heartbeat");
  const [channel, setChannel] = useState("call");
  const [pointId, setPointId] = useState("");
  const [note, setNote] = useState("");

  return (
    <ModalShell title="Log a touch" onClose={onClose} err={err}>
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
            type="button"
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
    </ModalShell>
  );
}

function ScheduleCall({
  onClose, onSave, busy, err,
}: {
  onClose: () => void;
  onSave: (b: any) => void;
  busy: boolean;
  err: string;
}) {
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [localErr, setLocalErr] = useState("");

  function submit() {
    const due = dueAtFromDateInput(date);
    if (!due) { setLocalErr("Pick a day on the calendar."); return; }
    setLocalErr("");
    onSave({ due_at: due, kind: "callback", note: note.trim() || null });
  }

  return (
    <ModalShell title="Schedule a call" onClose={onClose} err={err || localErr}>
      <label className="m6-field">
        <span>When</span>
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setLocalErr(""); }} />
      </label>
      <label className="m6-field">
        <span>Note (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="She said after 6" />
      </label>
      <div className="m6-modal-acts">
        <button type="button" className="m6-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="m6-btn primary" disabled={busy} onClick={submit}>
          {busy ? "Saving" : "Schedule"}
        </button>
      </div>
    </ModalShell>
  );
}

function AddContact({
  onClose, onSave, busy, err,
}: {
  onClose: () => void;
  onSave: (b: any) => void;
  busy: boolean;
  err: string;
}) {
  const [kind, setKind] = useState<(typeof POINT_KINDS)[number]["value"]>("mobile");
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState("facebook");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [personName, setPersonName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [permission, setPermission] = useState(true);
  const [script, setScript] = useState("");
  const [localErr, setLocalErr] = useState("");

  function submit() {
    let value = "";
    const extra: Record<string, unknown> = {};
    if (kind === "mobile" || kind === "landline") {
      if (!phone) { setLocalErr("Enter the full 10-digit number."); return; }
      value = phone;
    } else if (kind === "email") {
      value = email.trim();
      if (!value || !value.includes("@")) { setLocalErr("Enter an email address."); return; }
    } else if (kind === "social") {
      value = handle.trim();
      if (!value) { setLocalErr("Enter the handle."); return; }
      extra.platform = platform;
    } else if (kind === "address") {
      value = [street.trim(), city.trim(), state.trim().toUpperCase(), zip.trim()].filter(Boolean).join(", ");
      if (!street.trim() || !city.trim() || !state.trim()) {
        setLocalErr("Street, city, and state are required."); return;
      }
    } else if (kind === "person") {
      if (!personName.trim()) { setLocalErr("Who is this person?"); return; }
      value = phone || personName.trim();
      extra.person_name = personName.trim();
      extra.relationship = relationship.trim() || null;
      extra.permission_to_discuss = permission;
      extra.contact_script = script.trim() || null;
    }
    setLocalErr("");
    onSave({ kind, value, label: label.trim() || null, ...extra });
  }

  return (
    <ModalShell title="Add a way to reach them" onClose={onClose} err={err || localErr}>
      <label className="m6-field">
        <span>Kind</span>
        <select value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setLocalErr(""); }}>
          {POINT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </label>

      {(kind === "mobile" || kind === "landline" || kind === "person") && (
        <label className="m6-field">
          <span>{kind === "person" ? "Their number (optional)" : "Number"}</span>
          <PhoneInput value={phone} onChange={setPhone} />
        </label>
      )}
      {kind === "email" && (
        <label className="m6-field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </label>
      )}
      {kind === "social" && (
        <>
          <label className="m6-field">
            <span>Platform</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {SOCIAL_PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <label className="m6-field">
            <span>Handle</span>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@name" />
          </label>
        </>
      )}
      {kind === "address" && (
        <>
          <label className="m6-field">
            <span>Street</span>
            <input value={street} onChange={(e) => setStreet(e.target.value)} />
          </label>
          <div className="m6-lor-grid">
            <label className="m6-field">
              <span>City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className="m6-field">
              <span>State</span>
              <input value={state} onChange={(e) => setState(e.target.value.toUpperCase())} maxLength={2} placeholder="NV" />
            </label>
            <label className="m6-field">
              <span>ZIP</span>
              <input value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" />
            </label>
          </div>
        </>
      )}
      {kind === "person" && (
        <>
          <label className="m6-field">
            <span>Name</span>
            <input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Mom, case manager…" />
          </label>
          <label className="m6-field">
            <span>Relationship</span>
            <input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="mother, sponsor" />
          </label>
          <label className="m6-check">
            <input type="checkbox" checked={permission} onChange={(e) => setPermission(e.target.checked)} />
            Allowed to discuss the case
          </label>
          <label className="m6-field">
            <span>What we may say</span>
            <input value={script} onChange={(e) => setScript(e.target.value)} placeholder="Please have her call us" />
          </label>
        </>
      )}

      <label className="m6-field">
        <span>Label (optional)</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="mom, second number, work" />
      </label>

      <div className="m6-modal-acts">
        <button type="button" className="m6-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="m6-btn primary" disabled={busy} onClick={submit}>
          {busy ? "Saving" : "Add"}
        </button>
      </div>
    </ModalShell>
  );
}
