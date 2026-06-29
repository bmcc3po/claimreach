"use client";
import { useEffect, useState } from "react";
import RetainerTemplatesManager from "./RetainerTemplatesManager";

export default function TemplatesManager() {
  const [types, setTypes] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [busy, setBusy] = useState("");

  async function load() {
    const r = await fetch("/api/templates"); const d = await r.json();
    setTypes(d.types ?? []); setForms(d.forms ?? []);
  }
  useEffect(() => { load(); }, []);

  async function seed(key: string) {
    setBusy(key);
    const r = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "seed", case_key: key }) });
    const d = await r.json(); setBusy("");
    if (d.ok) { window.location.href = `/forms/${d.id}`; } else alert(d.error || "Failed");
  }
  async function seedAll() {
    if (!confirm("Create prebuilt templates for every case type that doesn't have one yet?")) return;
    setBusy("all");
    await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "seed_all" }) });
    setBusy(""); load();
  }

  const third = types.filter((t) => t.family === "third_party");
  const first = types.filter((t) => t.family === "first_party");

  const [tab, setTab] = useState<"intake" | "retainers">(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "retainers" ? "retainers" : "intake"
  );

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 18 }}>
        <button className={tab === "intake" ? "active" : ""} onClick={() => setTab("intake")}>Intake & Forms</button>
        <button className={tab === "retainers" ? "active" : ""} onClick={() => setTab("retainers")}>Retainers</button>
      </div>
      {tab === "retainers" ? <RetainerTemplatesManager /> : (
      <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Intake Templates</h1>
          <p className="muted" style={{ marginTop: 0 }}>Every case type ships with the canonical spine + the three mandatory gates baked in (represented / injured party / authority). Seed one, then add only the campaign-specific extras.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <a className="btn ghost" href="/forms">Manage forms</a>
          <a className="btn" href="/forms/new">+ New form</a>
          <button className="btn ghost" onClick={seedAll} disabled={busy === "all"}>{busy === "all" ? "Seeding…" : "Seed all missing"}</button>
        </div>
      </div>

      <Section title="Third-party PI / mass tort" items={third} forms={forms} busy={busy} onSeed={seed} />
      <Section title="First-party (you vs. your insurer)" items={first} forms={forms} busy={busy} onSeed={seed} />
      </div>
      )}
    </div>
  );
}

function Section({ title, items, forms, busy, onSeed }: any) {
  return (
    <div style={{ marginTop: 20 }}>
      <div className="section-title">{title}</div>
      <div className="tpl-grid">
        {items.map((t: any) => {
          const f = forms.find((x: any) => x.claim_type === t.key);
          return (
            <div key={t.key} className="tpl-card">
              <div className="tpl-card-head"><strong>{t.label}</strong>{t.hasTemplate && <span className="badge signed">built</span>}</div>
              <code className="muted" style={{ fontSize: 11 }}>{t.key}</code>
              <div style={{ marginTop: 10 }}>
                {f ? <a className="btn ghost sm" href={`/forms/${f.id}`}>Open template</a>
                  : <button className="btn sm" onClick={() => onSeed(t.key)} disabled={busy === t.key}>{busy === t.key ? "Creating…" : "Create template"}</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
