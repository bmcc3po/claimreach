// Josh's audit view for Motel 6 client care. Pure logic only, so the board,
// the file page and the tests cannot disagree about what a flag means.
// Neos stays the system of record for case work; this audits the drip,
// the messages and the update notes. Do not add a second flag vocabulary.

export const AUDIT_NOTE_SOURCE = "audit";
export const AUDIT_STALE_DAYS = 30;
export const SOP_NO_CONTACT_DAYS = 60;
export const SOP_UPDATE_DAYS = 90;

export type AuditVerdict = "reviewed" | "flagged";

export type AuditFlagKey =
  | "flagged"
  | "reply_waiting"
  | "no_contact_60"
  | "send_failed"
  | "never_reached"
  | "no_update_90"
  | "not_audited"
  | "opted_out";

export type AuditTone = "bad" | "warn" | "neut";

// Order is severity. The board sorts by the first flag a file carries.
export const AUDIT_FLAGS: { key: AuditFlagKey; label: string; hint: string; tone: AuditTone }[] = [
  { key: "flagged",        label: "Flagged",              hint: "Flagged in an audit. Needs follow up.",   tone: "bad" },
  { key: "reply_waiting",  label: "Reply waiting",        hint: "They wrote in. Nobody has answered yet.", tone: "bad" },
  { key: "no_contact_60",  label: "60 days no contact",   hint: "No real conversation in 60 days. Dormant under the SOP.", tone: "bad" },
  { key: "send_failed",    label: "Send failed",          hint: "A message did not go through.",            tone: "warn" },
  { key: "never_reached",  label: "Never reached",        hint: "No real conversation on this file yet.",   tone: "warn" },
  { key: "no_update_90",   label: "No update in 90 days", hint: "No written update has gone out in 90 days.", tone: "warn" },
  { key: "not_audited",    label: "Not audited",          hint: `Not reviewed in the last ${AUDIT_STALE_DAYS} days.`, tone: "neut" },
  { key: "opted_out",      label: "Opted out",            hint: "They asked us to stop. Do not send.",      tone: "neut" },
];

export function auditFlagMeta(key: AuditFlagKey) {
  return AUDIT_FLAGS.find((f) => f.key === key)!;
}

// ---------------------------------------------------------------------------
// Audit stamps. Stored as lead_notes rows with source = 'audit' so they show
// in the file's one notes thread. One body format, parsed here only.
// ---------------------------------------------------------------------------

const STAMP_PREFIX: Record<AuditVerdict, string> = {
  reviewed: "Audit: reviewed.",
  flagged: "Audit: flagged for follow up.",
};

export function isAuditVerdict(v: unknown): v is AuditVerdict {
  return v === "reviewed" || v === "flagged";
}

export function auditNoteBody(verdict: AuditVerdict, comment?: string | null): string {
  const c = String(comment ?? "").trim();
  return c ? `${STAMP_PREFIX[verdict]} ${c}` : STAMP_PREFIX[verdict];
}

export function parseAuditNote(body: string | null | undefined): { verdict: AuditVerdict; comment: string } | null {
  const b = String(body ?? "").trim();
  for (const v of ["flagged", "reviewed"] as AuditVerdict[]) {
    if (b.startsWith(STAMP_PREFIX[v])) {
      return { verdict: v, comment: b.slice(STAMP_PREFIX[v].length).trim() };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-file stats from raw rows. Server loads rows; this decides what counts.
// ---------------------------------------------------------------------------

export type AuditComm = {
  lead_id: string;
  channel: string | null;
  direction: string | null;
  send_status?: string | null;
  outcome?: string | null;
  occurred_at: string | null;
};

export type AuditNoteRow = {
  lead_id: string;
  source?: string | null;
  body: string | null;
  created_at: string;
  author_name?: string | null;
};

export type AuditStats = {
  lastUpdateAt: string | null;
  updates90: number;
  lastNoteAt: string | null;
  notes90: number;
  lastAuditAt: string | null;
  lastAuditVerdict: AuditVerdict | null;
  lastAuditBy: string | null;
};

const WRITTEN = new Set(["sms", "email", "letter"]);
const NOT_SENT = new Set(["blocked", "failed", "logged"]);

// A written update is an outbound text, email or letter that actually left.
// "logged" means an agent recorded it without sending; "blocked" never left.
export function isSentWrittenUpdate(c: Pick<AuditComm, "channel" | "direction" | "send_status" | "outcome">): boolean {
  if (c.direction !== "outbound") return false;
  if (!WRITTEN.has(String(c.channel ?? ""))) return false;
  if (NOT_SENT.has(String(c.send_status ?? ""))) return false;
  if (c.outcome === "undelivered") return false;
  return true;
}

function within(iso: string | null | undefined, nowIso: string, days: number): boolean {
  if (!iso) return false;
  return new Date(nowIso).getTime() - new Date(iso).getTime() <= days * 86400000;
}

function maxIso(a: string | null, b: string | null | undefined): string | null {
  if (!b) return a;
  if (!a) return b;
  return b > a ? b : a;
}

export function emptyAuditStats(): AuditStats {
  return {
    lastUpdateAt: null, updates90: 0, lastNoteAt: null, notes90: 0,
    lastAuditAt: null, lastAuditVerdict: null, lastAuditBy: null,
  };
}

export function aggregateAuditStats(
  comms: AuditComm[],
  notes: AuditNoteRow[],
  nowIso: string,
): Map<string, AuditStats> {
  const out = new Map<string, AuditStats>();
  const get = (id: string) => {
    let s = out.get(id);
    if (!s) { s = emptyAuditStats(); out.set(id, s); }
    return s;
  };
  for (const c of comms) {
    if (!c.lead_id || !isSentWrittenUpdate(c)) continue;
    const s = get(c.lead_id);
    s.lastUpdateAt = maxIso(s.lastUpdateAt, c.occurred_at);
    if (within(c.occurred_at, nowIso, SOP_UPDATE_DAYS)) s.updates90++;
  }
  for (const n of notes) {
    if (!n.lead_id) continue;
    const s = get(n.lead_id);
    const stamp = n.source === AUDIT_NOTE_SOURCE ? parseAuditNote(n.body) : null;
    if (stamp) {
      if (!s.lastAuditAt || n.created_at > s.lastAuditAt) {
        s.lastAuditAt = n.created_at;
        s.lastAuditVerdict = stamp.verdict;
        s.lastAuditBy = n.author_name ?? null;
      }
      continue;
    }
    s.lastNoteAt = maxIso(s.lastNoteAt, n.created_at);
    if (within(n.created_at, nowIso, SOP_UPDATE_DAYS)) s.notes90++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Flags for one file.
// ---------------------------------------------------------------------------

export type AuditFileInput = {
  last_two_way_at: string | null;
  days_since_contact: number | null;
  inbound_waiting?: boolean | null;
  last_send_failed?: boolean | null;
  opted_out?: boolean | null;
  started_at: string | null;
};

export function daysBetweenIso(fromIso: string | null | undefined, nowIso: string): number | null {
  if (!fromIso) return null;
  const d = Math.floor((new Date(nowIso).getTime() - new Date(fromIso).getTime()) / 86400000);
  return Number.isFinite(d) ? Math.max(d, 0) : null;
}

export function auditFlags(file: AuditFileInput, stats: AuditStats, nowIso: string): AuditFlagKey[] {
  const flags: AuditFlagKey[] = [];
  if (stats.lastAuditVerdict === "flagged") flags.push("flagged");
  if (file.inbound_waiting) flags.push("reply_waiting");
  if ((file.days_since_contact ?? 0) >= SOP_NO_CONTACT_DAYS) flags.push("no_contact_60");
  if (file.last_send_failed) flags.push("send_failed");
  if (!file.last_two_way_at) flags.push("never_reached");
  // A brand new file is not overdue for its first update until 90 days in.
  const updateClock = stats.lastUpdateAt ?? file.started_at;
  const sinceUpdate = daysBetweenIso(updateClock, nowIso);
  if (sinceUpdate !== null && sinceUpdate >= SOP_UPDATE_DAYS && !file.opted_out) flags.push("no_update_90");
  const sinceAudit = daysBetweenIso(stats.lastAuditAt, nowIso);
  if (sinceAudit === null || sinceAudit >= AUDIT_STALE_DAYS) flags.push("not_audited");
  if (file.opted_out) flags.push("opted_out");
  return flags;
}

export function auditSeverity(flags: AuditFlagKey[]): number {
  if (!flags.length) return AUDIT_FLAGS.length;
  return Math.min(...flags.map((f) => AUDIT_FLAGS.findIndex((m) => m.key === f)));
}

export function countFlags<T extends { flags: AuditFlagKey[] }>(rows: T[]): Record<AuditFlagKey, number> {
  const counts = Object.fromEntries(AUDIT_FLAGS.map((f) => [f.key, 0])) as Record<AuditFlagKey, number>;
  for (const r of rows) for (const f of r.flags) counts[f]++;
  return counts;
}

// ---------------------------------------------------------------------------
// Neos. Matter link comes from one env template so the format lives in config,
// e.g. M6_NEOS_MATTER_URL = "https://<neos host>/matters/{no}".
// ---------------------------------------------------------------------------

export function cleanNeosNumber(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9\-_.\/]{0,39}$/.test(s)) return null;
  return s;
}

export function neosMatterUrl(template: string | null | undefined, neosNo: string | null | undefined): string | null {
  const t = String(template ?? "").trim();
  const no = cleanNeosNumber(neosNo);
  if (!t || !no || !t.includes("{no}") || !/^https:\/\//i.test(t)) return null;
  return t.split("{no}").join(encodeURIComponent(no));
}

// ---------------------------------------------------------------------------
// File timeline: messages, calls, notes and audit stamps in one list.
// ---------------------------------------------------------------------------

export type AuditTimelineKind = "message" | "call" | "note" | "audit";

export type AuditTimelineItem = {
  id: string;
  kind: AuditTimelineKind;
  at: string;
  channel: string | null;
  direction: "inbound" | "outbound" | null;
  who: string;
  body: string;
  status: string | null;
  statusTone: AuditTone | "good" | null;
  verdict?: AuditVerdict;
};

export function commStatus(c: {
  direction?: string | null; channel?: string | null; send_status?: string | null;
  outcome?: string | null; blocked_reason?: string | null;
}): { label: string | null; tone: AuditTone | "good" | null } {
  if (c.direction === "inbound") return { label: "Received", tone: "good" };
  if (c.channel === "call" || c.channel === "voicemail") {
    if (c.outcome === "two_way") return { label: "Reached", tone: "good" };
    if (c.outcome === "voicemail") return { label: "Voicemail left", tone: "neut" };
    if (c.outcome === "no_answer") return { label: "No answer", tone: "neut" };
    if (c.outcome === "bad_number") return { label: "Bad number", tone: "warn" };
    return { label: null, tone: null };
  }
  if (c.send_status === "failed" || c.outcome === "undelivered") return { label: "Did not send", tone: "bad" };
  if (c.send_status === "blocked") return { label: "Blocked", tone: "warn" };
  if (c.send_status === "logged") return { label: "Logged, not sent", tone: "neut" };
  if (c.outcome === "delivered") return { label: "Delivered", tone: "good" };
  return { label: "Sent", tone: "good" };
}

export function commWho(c: { direction?: string | null; agent_name?: string | null; template_key?: string | null }): string {
  if (c.direction === "inbound") return "Client";
  const name = String(c.agent_name ?? "").trim();
  if (c.template_key) return name ? `${name} (drip)` : "Drip";
  return name || "Team";
}

export function buildAuditTimeline(
  comms: any[],
  notes: { id: string; body: string | null; created_at: string; source?: string | null; author_name?: string | null }[],
): AuditTimelineItem[] {
  const items: AuditTimelineItem[] = [];
  for (const c of comms ?? []) {
    const isCall = c.channel === "call" || c.channel === "voicemail";
    const st = commStatus(c);
    const body = String(c.body ?? c.jc_summary ?? c.transcript ?? "").trim();
    items.push({
      id: `c:${c.id}`,
      kind: isCall ? "call" : "message",
      at: c.occurred_at ?? c.created_at,
      channel: c.channel ?? null,
      direction: c.direction === "inbound" ? "inbound" : c.direction === "outbound" ? "outbound" : null,
      who: commWho(c),
      body,
      status: st.label,
      statusTone: st.tone,
    });
  }
  for (const n of notes ?? []) {
    const stamp = n.source === AUDIT_NOTE_SOURCE ? parseAuditNote(n.body) : null;
    items.push({
      id: `n:${n.id}`,
      kind: stamp ? "audit" : "note",
      at: n.created_at,
      channel: null,
      direction: null,
      who: n.author_name || "Team",
      body: stamp ? stamp.comment : String(n.body ?? "").trim(),
      status: stamp ? (stamp.verdict === "flagged" ? "Flagged" : "Reviewed") : null,
      statusTone: stamp ? (stamp.verdict === "flagged" ? "bad" : "good") : null,
      verdict: stamp?.verdict,
    });
  }
  return items.filter((i) => !!i.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// ---------------------------------------------------------------------------
// CSV export of the board. Plain text, quoted, Excel-safe.
// ---------------------------------------------------------------------------

export type AuditBoardRow = {
  lead_id: string;
  lead_no: string;
  name: string;
  neos_no: string | null;
  neos_url: string | null;
  last_two_way_at: string | null;
  last_touch_at: string | null;
  next_touch_due: string | null;
  stats: AuditStats;
  flags: AuditFlagKey[];
};

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function day(iso: string | null | undefined): string {
  return iso ? String(iso).slice(0, 10) : "";
}

export function auditBoardCsv(rows: AuditBoardRow[]): string {
  const head = [
    "File", "Name", "Neos #", "Last reached", "Last attempt", "Next touch",
    "Last written update", "Updates in 90 days", "Last note", "Last audit", "Audit result", "Flags",
  ];
  const lines = rows.map((r) => [
    r.lead_no, r.name, r.neos_no ?? "", day(r.last_two_way_at), day(r.last_touch_at), day(r.next_touch_due),
    day(r.stats.lastUpdateAt), r.stats.updates90, day(r.stats.lastNoteAt), day(r.stats.lastAuditAt),
    r.stats.lastAuditVerdict ?? "", r.flags.map((f) => auditFlagMeta(f).label).join("; "),
  ].map(csvCell).join(","));
  return [head.map(csvCell).join(","), ...lines].join("\r\n");
}
