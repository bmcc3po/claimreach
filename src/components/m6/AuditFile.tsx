"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { daysAgo, dueWording, formatLocalDateTime } from "@/lib/m6";
import {
  auditFlagMeta, auditNoteBody, parseAuditNote,
  type AuditBoardRow, type AuditTimelineItem, type AuditTimelineKind, type AuditVerdict,
} from "@/lib/m6-audit";

type Lead = { id: string; lead_no: string; name: string; neos_no: string | null; neos_url: string | null };
type Upcoming = { id: string; due_at: string; kind: string | null; note: string | null };

const KINDS: { value: AuditTimelineKind | "all"; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "message", label: "Texts and emails" },
  { value: "call", label: "Calls" },
  { value: "note", label: "Notes" },
  { value: "audit", label: "Audits" },
];

const CHANNEL_LABEL: Record<string, string> = {
  sms: "Text", email: "Email", call: "Call", voicemail: "Voicemail", letter: "Letter",
};

function itemTitle(i: AuditTimelineItem): string {
  if (i.kind === "audit") return "Audit";
  if (i.kind === "note") return "Note";
  const ch = CHANNEL_LABEL[i.channel ?? ""] ?? "Message";
  return i.direction === "inbound" ? `${ch} from the client` : `${ch} to the client`;
}

function since(iso: string | null | undefined): string {
  return iso ? daysAgo(iso) : "never";
}

export default function AuditFile({
  lead, row, timeline: initialTimeline, upcoming, neosReady, neosLinked,
}: {
  lead: Lead;
  row: AuditBoardRow | null;
  timeline: AuditTimelineItem[];
  upcoming: Upcoming[];
  neosReady: boolean;
  neosLinked: boolean;
}) {
  const [timeline, setTimeline] = useState(initialTimeline);
  const [kind, setKind] = useState<AuditTimelineKind | "all">("all");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<AuditVerdict | "neos" | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [neosNo, setNeosNo] = useState(lead.neos_no ?? "");
  const [neosUrl, setNeosUrl] = useState(lead.neos_url);
  const [neosMsg, setNeosMsg] = useState("");
  const [neosErr, setNeosErr] = useState("");

  const shown = useMemo(
    () => (kind === "all" ? timeline : timeline.filter((i) => i.kind === kind)),
    [timeline, kind],
  );
  const lastAudit = timeline.find((i) => i.kind === "audit") ?? null;

  async function stamp(verdict: AuditVerdict) {
    setErr(""); setOk("");
    if (verdict === "flagged" && !comment.trim()) {
      setErr("Say what needs follow up so the team knows what to fix.");
      return;
    }
    setBusy(verdict);
    try {
      const r = await fetch("/api/m6/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, verdict, comment }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { setErr(d.error || "That did not save. Try again."); return; }
      const parsed = parseAuditNote(d.note?.body ?? auditNoteBody(verdict, comment));
      setTimeline((t) => [{
        id: `n:${d.note?.id ?? Date.now()}`,
        kind: "audit",
        at: d.note?.created_at ?? new Date().toISOString(),
        channel: null,
        direction: null,
        who: d.note?.author_name ?? "You",
        body: parsed?.comment ?? comment.trim(),
        status: verdict === "flagged" ? "Flagged" : "Reviewed",
        statusTone: verdict === "flagged" ? "bad" : "good",
        verdict,
      }, ...t]);
      setComment("");
      setOk(verdict === "flagged" ? "Flagged. It shows at the top of the board." : "Marked reviewed.");
    } catch {
      setErr("That did not save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function saveNeos() {
    setNeosErr(""); setNeosMsg("");
    setBusy("neos");
    try {
      const r = await fetch("/api/m6/neos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, neos_no: neosNo }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { setNeosErr(d.error || "That did not save. Try again."); return; }
      setNeosNo(d.neos_no ?? "");
      setNeosUrl(d.neos_url ?? null);
      setNeosMsg(d.neos_no ? "Saved." : "Removed.");
    } catch {
      setNeosErr("That did not save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="m6-page">
      <Link href="/m6/audit" className="m6-back">All files</Link>
      <div className="m6-file-head">
        <div>
          <h1>{lead.name}</h1>
          <p className="m6-sub">{lead.lead_no}{neosNo ? `, Neos ${neosNo}` : ""}</p>
          {row && (
            <div className="m6-audit-flags m6-audit-flags-head">
              {row.flags.length === 0
                ? <span className="sb good">All good</span>
                : row.flags.map((f) => {
                    const m = auditFlagMeta(f);
                    return <span key={f} className={`sb ${m.tone}`} title={m.hint}>{m.label}</span>;
                  })}
            </div>
          )}
        </div>
        <div className="m6-audit-head-acts">
          {neosUrl && (
            <a className="m6-btn primary" href={neosUrl} target="_blank" rel="noopener noreferrer">Open in Neos</a>
          )}
          <Link className="m6-btn" href={`/m6/cases/${lead.id}`}>Open the full file</Link>
        </div>
      </div>

      <div className="m6-audit-grid">
        <section className="m6-card" aria-labelledby="audit-stamp-h">
          <h2 id="audit-stamp-h">Audit this file</h2>
          <p className="m6-hint">
            {lastAudit
              ? `Last audit ${daysAgo(lastAudit.at)} by ${lastAudit.who}: ${lastAudit.status?.toLowerCase()}.`
              : "This file has not been audited yet."}
          </p>
          <label className="m6-field">
            <span>Comment (needed for a flag)</span>
            <textarea
              className="m6-audit-text"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What you checked, or what needs fixing"
              maxLength={2000}
            />
          </label>
          {err && <p className="m6-error" role="alert">{err}</p>}
          {ok && <p className="m6-audit-ok" role="status">{ok}</p>}
          <div className="m6-audit-acts">
            <button type="button" className="m6-btn primary" disabled={!!busy} onClick={() => stamp("reviewed")}>
              {busy === "reviewed" ? "Saving" : "Mark reviewed"}
            </button>
            <button type="button" className="m6-btn m6-btn-flag" disabled={!!busy} onClick={() => stamp("flagged")}>
              {busy === "flagged" ? "Saving" : "Flag for follow up"}
            </button>
          </div>
        </section>

        <section className="m6-card" aria-labelledby="audit-facts-h">
          <h2 id="audit-facts-h">At a glance</h2>
          {row ? (
            <dl className="m6-audit-dl">
              <div><dt>Last reached</dt><dd>{since(row.last_two_way_at)}</dd></div>
              <div><dt>Last attempt</dt><dd>{since(row.last_touch_at)}</dd></div>
              <div><dt>Last written update</dt><dd>{since(row.stats.lastUpdateAt)}</dd></div>
              <div><dt>Updates in 90 days</dt><dd>{row.stats.updates90}</dd></div>
              <div><dt>Last note</dt><dd>{since(row.stats.lastNoteAt)}</dd></div>
              <div><dt>Next touch</dt><dd>{row.next_touch_due ? dueWording(row.next_touch_due) : "Nothing set"}</dd></div>
            </dl>
          ) : (
            <p className="m6-empty">No contact record on this file yet.</p>
          )}

          <h3 className="m6-audit-h3">Neos file number</h3>
          {neosReady ? (
            <>
              <div className="m6-audit-neos-row">
                <input
                  className="m6-search"
                  value={neosNo}
                  onChange={(e) => setNeosNo(e.target.value)}
                  placeholder="e.g. 2500138"
                  aria-label="Neos file number"
                  maxLength={40}
                />
                <button type="button" className="m6-btn" disabled={busy === "neos"} onClick={saveNeos}>
                  {busy === "neos" ? "Saving" : "Save"}
                </button>
              </div>
              {neosErr && <p className="m6-error" role="alert">{neosErr}</p>}
              {neosMsg && <p className="m6-audit-ok" role="status">{neosMsg}</p>}
              {!neosLinked && <p className="m6-hint">The Open in Neos button turns on once the Neos link is set up.</p>}
            </>
          ) : (
            <p className="m6-hint">Neos numbers are not switched on yet. Migration 0133 adds them.</p>
          )}
        </section>
      </div>

      {upcoming.length > 0 && (
        <section className="m6-card m6-audit-section" aria-labelledby="audit-next-h">
          <h2 id="audit-next-h">Coming up</h2>
          <ul className="m6-audit-upcoming">
            {upcoming.map((u) => (
              <li key={u.id}>
                <strong>{dueWording(u.due_at)}</strong>
                <span>{u.note || u.kind || "Scheduled touch"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="m6-card m6-audit-section" aria-labelledby="audit-tl-h">
        <div className="m6-card-head">
          <h2 id="audit-tl-h">Everything on this file</h2>
          <span className="m6-resultcount">{shown.length} of {timeline.length}</span>
        </div>
        <div className="m6-filters" role="group" aria-label="Show">
          {KINDS.map((k) => (
            <button key={k.value} type="button" className={`m6-chip${kind === k.value ? " on" : ""}`}
              aria-pressed={kind === k.value} onClick={() => setKind(k.value)}>
              {k.label}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="m6-empty">Nothing here yet.</p>
        ) : (
          <ol className="m6-audit-tl">
            {shown.map((i) => (
              <li key={i.id} className={`m6-audit-item ${i.kind}${i.direction === "inbound" ? " in" : ""}${i.verdict === "flagged" ? " flagged" : ""}`}>
                <div className="m6-audit-item-head">
                  <strong>{itemTitle(i)}</strong>
                  <span className="m6-audit-who">{i.who}</span>
                  {i.status && <span className={`sb ${i.statusTone ?? "neut"}`}>{i.status}</span>}
                  <time dateTime={i.at}>{formatLocalDateTime(i.at)}</time>
                </div>
                {i.body
                  ? <p className="m6-audit-body">{i.body}</p>
                  : <p className="m6-audit-body mute">{i.kind === "call" ? "No notes on this call." : "No text."}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
