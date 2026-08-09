export const runtime = "edge";
import { CRISIS_SOP } from "@/lib/sop";

export default function FirmSOP() {
  const s = CRISIS_SOP;
  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ marginBottom: 2 }}>{s.title}</h1>
      <p className="muted" style={{ marginTop: 0, fontWeight: 600 }}>{s.subtitle}</p>
      <div className="card" style={{ padding: 18, marginBottom: 16 }}><p style={{ margin: 0 }}>{s.intro}</p></div>
      {s.sections.map((sec) => (
        <div key={sec.h} className="card" style={{ padding: 18, marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>{sec.h}</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{sec.items.map((it, i) => <li key={i} style={{ marginBottom: 6 }}>{it}</li>)}</ul>
        </div>
      ))}
      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>Key resources</h3>
        {s.resources.map((r) => (
          <div key={r.name} className="vrow"><span className="vk">{r.name}</span><span className="vv">{r.value}</span></div>
        ))}
      </div>
    </div>
  );
}
