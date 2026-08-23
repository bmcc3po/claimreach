"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { HEALTH_LABEL, daysAgo, dueWording, type Health } from "@/lib/m6";
import FileActions from "./FileActions";

type Row = {
  id: string; lead_no: string; name: string; phone: string | null;
  health: Health; days_overdue: number;
  last_two_way_at: string | null; next_touch_due: string | null;
  ladder_step: number | null; owner: string | null; points: number;
};

const FILTERS: { value: string; label: string }[] = [
  { value: "all",    label: "All" },
  { value: "green",  label: "In touch" },
  { value: "yellow", label: "Overdue" },
  { value: "red",    label: "Hard to reach" },
  { value: "lost",   label: "Lost contact" },
  { value: "none",   label: "No contact info" },
];

export default function CaseList({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "none" && r.points > 0) return false;
      if (filter !== "all" && filter !== "none" && r.health !== filter) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        r.lead_no.toLowerCase().includes(needle) ||
        (r.phone ?? "").replace(/\D/g, "").includes(needle.replace(/\D/g, "")) &&
          needle.replace(/\D/g, "").length >= 3
      );
    });
  }, [rows, q, filter]);

  return (
    <>
      <div className="m6-toolbar">
        <input
          className="m6-search"
          placeholder="Search by name, file number, or phone"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search cases"
        />
        <div className="m6-filters" role="group" aria-label="Filter by contact health">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`m6-chip${filter === f.value ? " on" : ""}`}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="m6-resultcount">
        {shown.length} of {rows.length} files
      </p>

      {shown.length === 0 ? (
        <p className="m6-empty">
          Nothing on the desk matches that. Clear the search or pick another filter.
        </p>
      ) : (
        <ul className="m6-rows m6-rows-lg">
          {shown.map((r) => (
            <li key={r.id} className="m6-row-wrap">
              <Link href={`/m6/cases/${r.id}`} className="m6-row">
                <span className={`m6-dot ${r.health}`} aria-hidden="true" />
                <span className="m6-row-main">
                  <span className="m6-row-name">{r.name}</span>
                  <span className="m6-row-sub">
                    {r.lead_no}
                    {" · "}
                    {r.last_two_way_at ? `reached ${daysAgo(r.last_two_way_at)}` : "never reached"}
                    {r.points === 0 && " · no way to reach them"}
                    {r.owner && ` · ${r.owner}`}
                  </span>
                </span>
                <span className="m6-row-meta">
                  <span className="m6-row-tag">
                    {r.ladder_step ? `Step ${r.ladder_step}` : HEALTH_LABEL[r.health]}
                  </span>
                  <span className="m6-row-due">{dueWording(r.next_touch_due)}</span>
                </span>
              </Link>
              <FileActions file={{ id: r.id, name: r.name, phone: r.phone }} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
