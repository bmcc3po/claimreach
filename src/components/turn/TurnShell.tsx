"use client";

import type { TurnFile } from "@/lib/turn/types";
import { MISSING } from "@/lib/turn/types";
import { clientName } from "@/lib/turn/seed";
import { formatShort, mmiLabel, storedFacts } from "@/lib/turn/fields";
import { BOLTONS, SHELL_LINE, SHELL_MARK, SHELL_ROWS } from "@/lib/turn/shell";

export function ShellLegend() {
  return (
    <div className="turn-legend" data-testid="shell-legend">
      <div className="turn-legend-col ours">
        <p className="turn-kicker">{SHELL_MARK}</p>
        <p className="turn-legend-title">We own this state</p>
        <p className="turn-legend-list">{SHELL_ROWS.map((r) => r.label).join(" · ")}</p>
      </div>
      <div className="turn-legend-arrow" aria-hidden="true">
        <span>they write back</span>
        <strong>→</strong>
      </div>
      <div className="turn-legend-col bolt">
        <p className="turn-kicker">Bolt-ons</p>
        <p className="turn-legend-title">Vendors we call. One job.</p>
        <p className="turn-legend-list">
          {BOLTONS.map((b) => (b.onFile ? b.label : `${b.label} (off)`)).join(" · ")}
        </p>
      </div>
      <p className="turn-legend-copy">{SHELL_LINE}</p>
    </div>
  );
}

export function BoltonRail() {
  return (
    <aside className="turn-card turn-bolton-rail" data-testid="bolton-rail">
      <p className="turn-kicker">Bolt-ons · not a second CRM</p>
      <p className="turn-hint">Staff do not live in the vendor tab. A bolt-on does one job and writes status + files back to the shell.</p>
      {BOLTONS.map((b) => (
        <div key={b.key} className={`turn-bolton ${b.onFile ? "" : "off"}`}>
          <div className="nm">
            <span className="tag">bolt-on</span> {b.label}
          </div>
          <div className="job">{b.job}</div>
          <div className="writes">writes → {b.writes}</div>
          {b.gray && <div className="gray">{b.gray}</div>}
        </div>
      ))}
    </aside>
  );
}

export function ShellTables({ file }: { file: TurnFile }) {
  const f = storedFacts(file);
  return (
    <div className="turn-shell-grid" data-testid="shell-tables">
      <div className="turn-card">
        <p className="turn-kicker">{SHELL_MARK} · matter</p>
        <div className="turn-row"><span className="k">Client</span><span>{clientName(file)}</span></div>
        <div className="turn-row"><span className="k">DOI</span><span>{f.doi}</span></div>
        <div className="turn-row"><span className="k">Venue</span><span>{f.venue}</span></div>
        <div className="turn-row"><span className="k">SOL</span><span>{f.sol}</span></div>
        <div className="turn-row"><span className="k">Stage</span><span>{file.phase}</span></div>
      </div>
      <div className="turn-card">
        <p className="turn-kicker">{SHELL_MARK} · people</p>
        {file.people.map((p) => (
          <div key={p.id} className="turn-row">
            <span className="k">{p.role}</span>
            <span>{p.firstName} {p.lastName}{p.org ? ` · ${p.org}` : ""}{p.phone ? ` · ${p.phone}` : ""}</span>
          </div>
        ))}
      </div>
      <div className="turn-card">
        <p className="turn-kicker">{SHELL_MARK} · providers</p>
        <p className="turn-hint">MMI lives on this treatment plan: <b>{mmiLabel(file)}</b>. Empty visit stays {MISSING}.</p>
        <table className="turn-table">
          <thead>
            <tr><th>Provider</th><th>Plan</th><th>Last visit</th><th>Next</th></tr>
          </thead>
          <tbody>
            {file.providers.map((p) => (
              <tr key={p.id}>
                <td>{p.name}<div className="turn-muted">{p.kind}</div></td>
                <td>{p.cadence || file.treatingStatus}</td>
                <td>{p.lastVisit ? formatShort(p.lastVisit) : MISSING}</td>
                <td>{p.nextVisit ? `${formatShort(p.nextVisit)}${p.nextTime ? ` · ${p.nextTime}` : ""}` : MISSING}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="turn-card">
        <p className="turn-kicker">{SHELL_MARK} · carrier / coverage</p>
        {file.carriers.map((c) => (
          <div key={c.id}>
            <div className="turn-row"><span className="k">Carrier</span><span>{c.name}</span></div>
            <div className="turn-row"><span className="k">Claim</span><span>{c.claimNo}</span></div>
            <div className="turn-row"><span className="k">Insured</span><span>{c.insured || MISSING}</span></div>
            <div className="turn-row"><span className="k">LOR</span><span>{c.lorMailedOn ? `mailed ${formatShort(c.lorMailedOn)}${c.lorChannel ? ` · ${c.lorChannel}` : ""}` : MISSING}</span></div>
            <div className="turn-row"><span className="k">Limits</span><span>{c.limitsIn ? "in" : c.limitsRequestedOn ? `requested ${formatShort(c.limitsRequestedOn)} · not in` : MISSING}</span></div>
          </div>
        ))}
      </div>
      <div className="turn-card">
        <p className="turn-kicker">{SHELL_MARK} · liens</p>
        {file.liens.length
          ? file.liens.map((l) => (
            <div key={l.id} className="turn-row"><span className="k">{l.holder}</span><span>{l.status}{l.amount ? ` · ${l.amount}` : ""}</span></div>
          ))
          : <p className="turn-hint">No lien rows. {MISSING}.</p>}
      </div>
      <div className="turn-card">
        <p className="turn-kicker">{SHELL_MARK} · document pointers</p>
        {(file.documents ?? []).map((d) => (
          <div key={d.id} className="turn-row">
            <span className="k">{d.kind}</span>
            <span>{d.label}{d.on ? ` · ${formatShort(d.on)}` : ""} · {d.pointer}</span>
          </div>
        ))}
        <p className="turn-foot">Records live on these pointers. ChartSwap is a hospital toll, not the path.</p>
      </div>
      <div className="turn-card">
        <p className="turn-kicker">{SHELL_MARK} · send log</p>
        {file.sendLog.map((s) => (
          <div key={s.id} className="turn-row">
            <span className="k">{s.channel}</span>
            <span>{s.status} · {s.toLabel} · live {String(s.live)}</span>
          </div>
        ))}
        {!file.sendLog.length && <p className="turn-hint">{MISSING}</p>}
      </div>
      <div className="turn-card">
        <p className="turn-kicker">{SHELL_MARK} · tasks / KEEP</p>
        <div className="turn-row"><span className="k">KEEP ladder</span><span>{f.keep}</span></div>
        {file.tasks.map((t) => (
          <div key={t.id} className="turn-row"><span className="k">{t.playbook}</span><span>{t.owner} · {t.dueLabel}</span></div>
        ))}
        {!file.tasks.length && <p className="turn-hint">No ticklers yet. They land here, not in a vendor.</p>}
      </div>
      <div className="turn-card">
        <p className="turn-kicker">{SHELL_MARK} · who sees this file</p>
        {(file.acl ?? []).map((a) => (
          <div key={a.name} className="turn-row"><span className="k">{a.access}</span><span>{a.name} · {a.role}</span></div>
        ))}
      </div>
    </div>
  );
}

export function FileShell({ file }: { file: TurnFile }) {
  return (
    <section className="turn-file-shell">
      <div className="turn-shell-main">
        <ShellTables file={file} />
      </div>
      <BoltonRail />
    </section>
  );
}
