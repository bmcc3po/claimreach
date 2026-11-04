"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { daysAgo, dueWording } from "@/lib/m6";
import {
  auditBoardCsv, auditFlagMeta, countFlags,
  type AuditBoardRow, type AuditFlagKey,
} from "@/lib/m6-audit";

const GAUGES: { key: AuditFlagKey; tone: "red" | "amber" | "green" }[] = [
  { key: "flagged", tone: "red" },
  { key: "reply_waiting", tone: "red" },
  { key: "no_contact_60", tone: "red" },
  { key: "no_update_90", tone: "amber" },
  { key: "not_audited", tone: "amber" },
];

const MORE: AuditFlagKey[] = ["never_reached", "send_failed", "opted_out"];

type Filter = AuditFlagKey | "all" | "clear";

function shortDay(iso: string | null | undefined): string {
  if (!iso) return "Never";
  return daysAgo(iso).replace(/^./, (c) => c.toUpperCase());
}

export default function AuditBoard({
  rows, neosLinked, nowIso,
}: { rows: AuditBoardRow[]; neosLinked: boolean; nowIso: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const counts = useMemo(() => countFlags(rows), [rows]);
  const clearCount = useMemo(() => rows.filter((r) => r.flags.length === 0).length, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "clear" && r.flags.length) return false;
      if (filter !== "all" && filter !== "clear" && !r.flags.includes(filter)) return false;
      if (!needle) return true;
      return r.name.toLowerCase().includes(needle)
        || r.lead_no.toLowerCase().includes(needle)
        || (r.neos_no ?? "").toLowerCase().includes(needle);
    });
  }, [rows, filter, q]);

  function exportCsv() {
    const blob = new Blob([auditBoardCsv(shown)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `m6-audit-${nowIso.slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-label="Audit board">
      <div className="m6-gauges" role="tablist" aria-label="Audit flags">
        {GAUGES.map((g) => {
          const meta = auditFlagMeta(g.key);
          const on = filter === g.key;
          return (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={on}
              className={`m6-gauge ${counts[g.key] ? g.tone : "green"}${on ? " on" : ""}`}
              onClick={() => setFilter(on ? "all" : g.key)}
            >
              <span className="m6-gauge-num">{counts[g.key]}</span>
              <span className="m6-gauge-label">{meta.label}</span>
              <span className="m6-gauge-hint">{meta.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="m6-toolbar">
        <input
          className="m6-search"
          placeholder="Search by name, file number or Neos number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search files"
        />
        <div className="m6-filters" role="group" aria-label="More filters">
          <button type="button" className={`m6-chip${filter === "all" ? " on" : ""}`} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            All {rows.length}
          </button>
          {MORE.map((k) => (
            <button key={k} type="button" className={`m6-chip${filter === k ? " on" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(filter === k ? "all" : k)}>
              {auditFlagMeta(k).label} {counts[k]}
            </button>
          ))}
          <button type="button" className={`m6-chip${filter === "clear" ? " on" : ""}`} aria-pressed={filter === "clear"} onClick={() => setFilter(filter === "clear" ? "all" : "clear")}>
            No flags {clearCount}
          </button>
        </div>
      </div>

      <div className="m6-audit-bar">
        <p className="m6-resultcount">{shown.length} of {rows.length} files</p>
        <button type="button" className="m6-btn sm" onClick={exportCsv} disabled={!shown.length}>
          Download for Excel
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="m6-empty">Nothing matches. Clear the search or pick another filter.</p>
      ) : (
        <div className="m6-audit-wrap">
          <table className="m6-audit">
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Last reached</th>
                <th scope="col">Last written update</th>
                <th scope="col">Next touch</th>
                <th scope="col">Last note</th>
                <th scope="col">Last audit</th>
                <th scope="col">Flags</th>
                <th scope="col"><span className="m6-sr">Neos</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.lead_id}>
                  <td data-label="File">
                    <Link href={`/m6/audit/${r.lead_id}`} className="m6-audit-name">{r.name}</Link>
                    <span className="m6-audit-sub">{r.lead_no}</span>
                    {r.neos_no && <span className="m6-audit-sub">Neos {r.neos_no}</span>}
                  </td>
                  <td data-label="Last reached"><span>{shortDay(r.last_two_way_at)}</span></td>
                  <td data-label="Last written update">
                    <span>
                      {shortDay(r.stats.lastUpdateAt)}
                      {r.stats.updates90 > 0 && <span className="m6-audit-sub">{r.stats.updates90} in 90 days</span>}
                    </span>
                  </td>
                  <td data-label="Next touch"><span>{r.next_touch_due ? dueWording(r.next_touch_due) : "Nothing set"}</span></td>
                  <td data-label="Last note"><span>{shortDay(r.stats.lastNoteAt)}</span></td>
                  <td data-label="Last audit">
                    <span>
                      {r.stats.lastAuditAt ? shortDay(r.stats.lastAuditAt) : "Never"}
                      {r.stats.lastAuditBy && <span className="m6-audit-sub">{r.stats.lastAuditBy}</span>}
                    </span>
                  </td>
                  <td data-label="Flags">
                    {r.flags.length === 0 ? (
                      <span className="sb good">All good</span>
                    ) : (
                      <span className="m6-audit-flags">
                        {r.flags.map((f) => {
                          const m = auditFlagMeta(f);
                          return <span key={f} className={`sb ${m.tone}`} title={m.hint}>{m.label}</span>;
                        })}
                      </span>
                    )}
                  </td>
                  <td data-label="Neos" className="m6-audit-neos">
                    {r.neos_url ? (
                      <a className="m6-btn sm" href={r.neos_url} target="_blank" rel="noopener noreferrer">Open in Neos</a>
                    ) : (
                      <Link className="m6-btn sm" href={`/m6/audit/${r.lead_id}`}>
                        {r.neos_no ? "Review" : neosLinked ? "Add Neos #" : "Review"}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
