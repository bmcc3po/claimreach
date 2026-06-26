export const runtime = "edge";

export default function GrievousPage() {
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>⚡ Grievous</h2>
      <p className="muted">Live QA and coaching that watches every intake against campaign criteria.</p>

      <div className="dash-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
        <div className="kpi"><div className="kv">Tier 1</div><div className="kl">Inline guardrails</div><div className="ksub">on</div></div>
        <div className="kpi"><div className="kv">Tier 2</div><div className="kl">Qualify review</div><div className="ksub">on</div></div>
        <div className="kpi"><div className="kv">Tier 3</div><div className="kl">Transcript vs form</div><div className="ksub">after call</div></div>
        <div className="kpi"><div className="kv">Tier 4</div><div className="kl">Live coaching</div><div className="ksub">soon</div></div>
      </div>

      <div className="side-card" style={{ maxWidth: 640, marginTop: 18 }}>
        <h3>Coaching Review</h3>
        <p className="muted">Post-call scores and flags will appear here once the Grievous relay is connected.</p>
        <a className="btn" href="https://www.youtube.com/watch?v=JsntlJZ9h1U" target="_blank" rel="noopener noreferrer">▶ Open Grievous (placeholder)</a>
      </div>

      <div className="side-card" style={{ maxWidth: 640 }}>
        <h3>Ask Grievous</h3>
        <p className="muted">In-console Q&amp;A for agents (coming). Ask what to say, how to handle an objection, or whether a file qualifies.</p>
      </div>
    </div>
  );
}
