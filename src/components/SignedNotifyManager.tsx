"use client";
// Settings > When a client signs. Each case type has one distro (like mva@)
// that every signing of that type goes to, and each campaign can CC more
// (like tmpmva@). Saved per line; "Saved" only shows after the server says so.
import { useEffect, useState } from "react";

type Camp = { id: string; name: string; firm: string; active: boolean; cc: string };
type Group = { caseType: string; label: string; to: string; campaigns: Camp[] };

function Line({ label, sub, value, placeholder, canEdit, save }: {
  label: string; sub?: string; value: string; placeholder: string; canEdit: boolean;
  save: (v: string) => Promise<string | null>;
}) {
  const [v, setV] = useState(value);
  const [state, setState] = useState<"" | "saving" | "saved">("");
  const [err, setErr] = useState("");
  useEffect(() => { setV(value); }, [value]);
  const dirty = v.trim() !== value.trim();
  async function go() {
    setState("saving"); setErr("");
    const e = await save(v);
    if (e) { setErr(e); setState(""); } else setState("saved");
  }
  return (
    <div className="sn-line">
      <div className="sn-k"><span>{label}</span>{!!sub && <span className="sn-sub">{sub}</span>}</div>
      <div className="sn-v">
        <input value={v} placeholder={placeholder} disabled={!canEdit} aria-label={`Emails for ${label}`}
          onChange={(e) => { setV(e.target.value); setState(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" && dirty) go(); }} />
        {canEdit && <button className="btn" disabled={!dirty || state === "saving"} onClick={go}>{state === "saving" ? "Saving" : "Save"}</button>}
      </div>
      {state === "saved" && !dirty && <div className="sn-ok">Saved</div>}
      {!!err && <div className="sn-err">{err}</div>}
    </div>
  );
}

export default function SignedNotifyManager() {
  const [data, setData] = useState<{ canEdit: boolean; needsMigration?: boolean; groups: Group[] } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/notify-routes").then((r) => r.json()).then((d) => { if (d.error) setErr(d.error); else setData(d); })
      .catch(() => setErr("Could not load these. Refresh and try again."));
  }, []);

  async function save(body: Record<string, string>): Promise<string | null> {
    try {
      const r = await fetch("/api/notify-routes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      return r.ok && !d.error ? null : (d.error || `That did not save (${r.status}).`);
    } catch { return "That did not save. Check your connection."; }
  }

  return (
    <div className="sn">
      <style>{CSS}</style>
      <h2 style={{ marginTop: 0 }}>When a client signs</h2>
      <p className="sn-lede">The moment a client signs, everyone here gets an email with the case summary and a link to the file.
        Use group addresses (a distro like mva@) so people are added and removed in your email, not here.</p>
      {!!err && <div className="sn-err">{err}</div>}
      {!data && !err && <p className="muted">Loading</p>}
      {data?.needsMigration && <div className="sn-err">Run migration 0099 in Supabase first. Then this page fills in.</div>}
      {data && !data.needsMigration && data.groups.length === 0 && <p className="muted">No campaigns yet.</p>}
      {data?.groups.map((g) => (
        <section key={g.caseType} className="sn-group">
          <h3>{g.label}</h3>
          <Line label={`Every ${g.label} signing`} sub="The distro. Gets every one." value={g.to} placeholder={`${g.label.toLowerCase().replace(/\s+/g, "")}@yourdomain.com`}
            canEdit={data.canEdit} save={(v) => save({ case_type: g.caseType, to: v })} />
          {g.campaigns.map((c) => (
            <Line key={c.id} label={c.name} sub={[c.firm, c.active ? "" : "inactive"].filter(Boolean).join(", ") + ". CC for this campaign only."} value={c.cc}
              placeholder="Optional, like tmpmva@yourdomain.com" canEdit={data.canEdit} save={(v) => save({ campaign_id: c.id, cc: v })} />
          ))}
        </section>
      ))}
      {data && !data.canEdit && !data.needsMigration && <p className="muted">Only an owner or admin can change these.</p>}
    </div>
  );
}

const CSS = `
.sn{max-width:880px}
.sn-lede{color:var(--ink-soft,#4B5667);max-width:640px;margin:0 0 18px;line-height:1.5}
.sn-group{background:var(--surface,#fff);border:1px solid var(--line,#E3E6EB);border-radius:12px;margin-bottom:16px;overflow:hidden}
.sn-group h3{margin:0;padding:14px 18px;font-size:15px;border-bottom:1px solid var(--line,#E3E6EB)}
.sn-line{display:grid;grid-template-columns:minmax(200px,280px) 1fr;gap:6px 18px;padding:14px 18px;border-bottom:1px solid var(--line-soft,#EEF0F3);align-items:center}
.sn-line:last-child{border-bottom:none}
.sn-k{display:flex;flex-direction:column;gap:2px;font-weight:500}
.sn-sub{font-size:12.5px;font-weight:400;color:var(--ink-faint,#6B7584)}
.sn-v{display:flex;gap:8px;align-items:center}
.sn-v input{flex:1;min-width:0}
.sn-ok{grid-column:2;font-size:12.5px;color:#067647}
.sn-err{grid-column:1/-1;font-size:13px;color:#B42318;margin:4px 0}
@media (max-width:700px){.sn-line{grid-template-columns:1fr}.sn-ok{grid-column:1}}
`;
