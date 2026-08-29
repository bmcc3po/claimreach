"use client";
export const runtime = "edge";

import { useMemo, useState } from "react";
import Link from "next/link";
import { listSeedFiles, clientName } from "@/lib/turn/seed";
import { lastHumanLabel, storedFacts } from "@/lib/turn/fields";
import { TurnChrome } from "@/components/turn/TurnChrome";
import { ShellLegend } from "@/components/turn/TurnShell";

export default function TurnDesk() {
  const files = useMemo(() => listSeedFiles(), []);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = files.filter((f) => {
    if (!needle) return true;
    const facts = storedFacts(f);
    const blob = [clientName(f), f.fileNo, facts.claimNo, facts.clientPhone, f.caseType].join(" ").toLowerCase();
    return blob.includes(needle);
  });

  return (
    <div className="turn">
      <TurnChrome role="attorney" search={q} onSearch={setQ} />
      <div className="turn-wrap">
        <p className="turn-kicker">TMP · Vegas desk</p>
        <h1 className="turn-h1">ClaimTurn</h1>
        <p className="turn-sub">The file is the presentation. Demo only. Fake people. Motel 6 is not here.</p>
        <ShellLegend />
        {shown.map((f) => {
          const facts = storedFacts(f);
          return (
            <Link key={f.id} href={`/turn/${f.id}`} className="turn-desk-card">
              <h2 className="turn-q" style={{ fontSize: 24 }}>{clientName(f)}</h2>
              <p className="turn-sub">{f.fileNo} · {f.caseType} · {f.phase} · {facts.carrier} {facts.claimNo}</p>
              <div className="turn-pills">
                <span className="turn-pill"><strong>MMI</strong> {facts.mmi}</span>
                <span className="turn-pill"><strong>Left</strong> {facts.leftToDo}</span>
                <span className="turn-pill"><strong>Last human</strong> {lastHumanLabel(f)}</span>
                <span className="turn-pill"><strong>Records</strong> {facts.records}</span>
              </div>
            </Link>
          );
        })}
        {!shown.length && <p className="turn-hint">No file matches that search.</p>}
      </div>
    </div>
  );
}
