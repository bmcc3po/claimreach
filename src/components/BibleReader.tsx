"use client";
import { useState, useMemo } from "react";
import { BIBLE, BIBLE_GROUPS, searchBible, type BibleEntry } from "@/lib/bible";
import { ESCALATION_LINE } from "@/lib/crissi-disclaimers";

// Clean searchable Bible reference. Left list of topics by group (or search),
// right detail panel. Acute entries flagged for fast grab in panic mode.
export default function BibleReader() {
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState<string>(BIBLE[0].id);
  const results = useMemo(() => searchBible(search), [search]);
  const selected = BIBLE.find((e) => e.id === topic);
  const list = search ? results : null;

  return (
    <div>
      <div className="chapter-head">
        <span className="chapter-head-num">02</span>
        <div><h1 style={{ margin: 0 }}>The Bible</h1><p className="muted" style={{ margin: "2px 0 0" }}>Trauma-informed reference for any moment. 🚨 entries are break-glass walkthroughs.</p></div>
      </div>

      <div className="bible-reader">
        <div className="bible-reader-nav">
          <input placeholder="Search topics…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 10 }} />
          {list ? (
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{list.length} result{list.length === 1 ? "" : "s"}</div>
              {list.map((t) => <TopicBtn key={t.id} t={t} active={topic === t.id} onClick={() => setTopic(t.id)} />)}
            </div>
          ) : (
            BIBLE_GROUPS.map((g) => (
              <div key={g.id} style={{ marginBottom: 12 }}>
                <div className="section-title" style={{ marginBottom: 4 }}>{g.label}</div>
                {BIBLE.filter((t) => t.group === g.id).map((t) => <TopicBtn key={t.id} t={t} active={topic === t.id} onClick={() => setTopic(t.id)} />)}
              </div>
            ))
          )}
        </div>
        <div className="bible-reader-detail">
          {selected && <BibleDetail e={selected} />}
        </div>
      </div>
    </div>
  );
}

function TopicBtn({ t, active, onClick }: { t: BibleEntry; active: boolean; onClick: () => void }) {
  return (
    <button className={`bible-topic ${active ? "active" : ""} ${t.acute ? "acute" : ""}`} onClick={onClick}>
      {t.acute && <span className="bible-topic-flag">🚨</span>}{t.title}
    </button>
  );
}

function BibleDetail({ e }: { e: BibleEntry }) {
  return (
    <div className="card" style={{ padding: 22 }}>
      {e.acute && <div className="acute-banner">🚨 Acute — break glass. Stay with them. Don't abandon. {ESCALATION_LINE}</div>}
      <h2 style={{ marginTop: e.acute ? 12 : 0 }}>{e.title}</h2>
      <p style={{ fontSize: 14.5 }}>{e.summary}</p>
      {e.whatYouMightHear && (<><div className="section-title">What you might hear</div><ul className="bible-list">{e.whatYouMightHear.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
      {e.steps && (<><div className="section-title">Step by step</div>{e.steps.map((s, i) => <div key={i} className="bible-step"><strong>{s.label}</strong><span>{s.detail}</span></div>)}</>)}
      {e.say && (<><div className="section-title" style={{ color: "var(--ok)" }}>Say</div><ul className="bible-list">{e.say.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
      {e.avoid && (<><div className="section-title" style={{ color: "var(--danger)" }}>Avoid</div><ul className="bible-list">{e.avoid.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
      {e.whatToListenFor && (<><div className="section-title">What to listen for</div><ul className="bible-list">{e.whatToListenFor.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
      {e.pitfalls && (<><div className="section-title" style={{ color: "var(--flag)" }}>Pitfalls</div><ul className="bible-list">{e.pitfalls.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
      {e.why && (<><div className="section-title">Why this works</div><p style={{ fontSize: 13.5 }}>{e.why}</p></>)}
      {e.hardLines && (<div className="hardlines"><div className="section-title" style={{ color: "var(--danger)" }}>Lines you cannot cross</div><ul className="bible-list">{e.hardLines.map((x, i) => <li key={i}>{x}</li>)}</ul></div>)}
      {e.escalate && <div className="escalate-line">↗ {e.escalate}</div>}
    </div>
  );
}
