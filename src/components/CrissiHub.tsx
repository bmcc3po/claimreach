"use client";
import { useState, useMemo } from "react";
import { CrissiLogo } from "./CrissiLogo";
import { BIBLE, BIBLE_GROUPS, searchBible, type BibleEntry } from "@/lib/bible";
import { SILVER_LINERS, searchLiners } from "@/lib/silver-liners";
import { COURSE } from "@/lib/course";
import { CRISIS_SOP } from "@/lib/sop";
import { DISCLAIMER_SHORT, DISCLAIMER_FULL, HARD_LINES } from "@/lib/crissi-disclaimers";
import CrissiAcademy from "./CrissiAcademy";
import SilverLiners from "./SilverLiners";
import TrainingRecords from "./TrainingRecords";
import BibleReader from "./BibleReader";

type Chapter = "start" | "course" | "bible" | "liners" | "sop" | "records";

const CHAPTERS: { id: Chapter; num: string; label: string; sub: string; icon: string }[] = [
  { id: "start", num: "00", label: "Start Here", sub: "What Crissi is & the boundaries", icon: "🧭" },
  { id: "course", num: "01", label: "The Course", sub: "7 guided chapters · your training path", icon: "🎓" },
  { id: "bible", num: "02", label: "The Bible", sub: "Searchable reference for any moment", icon: "📖" },
  { id: "liners", num: "03", label: "Silver Liners", sub: "Hope lines to lift a chin", icon: "✨" },
  { id: "sop", num: "04", label: "Crisis SOP", sub: "The protocol", icon: "🆘" },
];

export default function CrissiHub({ isManager = false }: { isManager?: boolean }) {
  const [chapter, setChapter] = useState<Chapter>("start");
  const [globalSearch, setGlobalSearch] = useState("");

  // Panic-mode global search across Bible + Liners.
  const searchHits = useMemo(() => {
    const q = globalSearch.trim();
    if (!q) return null;
    return {
      bible: searchBible(q).slice(0, 8),
      liners: searchLiners(q).slice(0, 8),
    };
  }, [globalSearch]);

  const chapters = isManager
    ? [...CHAPTERS, { id: "records" as Chapter, num: "05", label: "Records", sub: "Who completed training", icon: "📋" }]
    : CHAPTERS;

  return (
    <div className="crissi-hub">
      {/* Left rail — chapters */}
      <aside className="crissi-rail">
        <div className="crissi-rail-head">
          <CrissiLogo height={30} />
        </div>
        <div className="crissi-rail-search">
          <input placeholder="🔍 Search everything…" value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} />
        </div>
        {!globalSearch && chapters.map((c) => (
          <button key={c.id} className={`crissi-chapter ${chapter === c.id ? "active" : ""}`} onClick={() => setChapter(c.id)}>
            <span className="crissi-chapter-num">{c.num}</span>
            <span className="crissi-chapter-text">
              <span className="crissi-chapter-label">{c.icon} {c.label}</span>
              <span className="crissi-chapter-sub">{c.sub}</span>
            </span>
          </button>
        ))}
        {globalSearch && <p className="muted" style={{ fontSize: 12, padding: "8px 4px" }}>Searching across the Bible and Silver Liners. Clear to return to chapters.</p>}
      </aside>

      {/* Main panel */}
      <main className="crissi-main">
        {searchHits ? (
          <GlobalResults hits={searchHits} onClear={() => setGlobalSearch("")} onOpenBible={() => { setGlobalSearch(""); setChapter("bible"); }} />
        ) : (
          <>
            {chapter === "start" && <StartHere onGo={setChapter} />}
            {chapter === "course" && <CrissiAcademy />}
            {chapter === "bible" && <BibleReader />}
            {chapter === "liners" && (
              <div>
                <ChapterHead num="03" title="Silver Liners" blurb="Hopeful lines to get a caller through the call and the day. A bandage, not a fix. Search by the mood or moment." />
                <SilverLiners />
              </div>
            )}
            {chapter === "sop" && <SopChapter />}
            {chapter === "records" && isManager && (
              <div>
                <ChapterHead num="05" title="Training Records" blurb="Who has completed which Crissi Academy chapter, with quiz scores and dates." />
                <TrainingRecords />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ChapterHead({ num, title, blurb }: { num: string; title: string; blurb: string }) {
  return (
    <div className="chapter-head">
      <span className="chapter-head-num">{num}</span>
      <div>
        <h1 style={{ margin: 0 }}>{title}</h1>
        <p className="muted" style={{ margin: "2px 0 0" }}>{blurb}</p>
      </div>
    </div>
  );
}

function StartHere({ onGo }: { onGo: (c: Chapter) => void }) {
  return (
    <div>
      <div className="chapter-head">
        <CrissiLogo height={40} />
      </div>
      <p style={{ fontSize: 15.5, maxWidth: 720 }}>
        Crissi is your crisis-support companion and trauma-informed coach. She helps you handle hard calls with empathy and grace under fire,
        steadies you when a call rattles you, and trains you to navigate the situations this work brings. She is here to help you
        <strong> stabilize, connect, and escalate</strong> — never to replace you, and never to make you a therapist.
      </p>

      <div className="disclaimer-bar" style={{ maxWidth: 720, marginBottom: 18 }}>{DISCLAIMER_SHORT}</div>

      <div className="start-grid">
        <button className="start-card" onClick={() => onGo("course")}>
          <span className="start-icon">🎓</span>
          <strong>Start the Course</strong>
          <span className="muted">7 guided chapters. Begin here if you're new — work through them in order.</span>
        </button>
        <button className="start-card" onClick={() => onGo("bible")}>
          <span className="start-icon">📖</span>
          <strong>Open the Bible</strong>
          <span className="muted">Searchable reference for any moment. The 🚨 entries are break-glass walkthroughs.</span>
        </button>
        <button className="start-card" onClick={() => onGo("liners")}>
          <span className="start-icon">✨</span>
          <strong>Find a Silver Liner</strong>
          <span className="muted">Hope lines to lift a caller's chin. Search by mood.</span>
        </button>
        <button className="start-card" onClick={() => onGo("sop")}>
          <span className="start-icon">🆘</span>
          <strong>Crisis SOP</strong>
          <span className="muted">The protocol: support, connect, escalate.</span>
        </button>
      </div>

      <div className="card" style={{ padding: 18, marginTop: 18, maxWidth: 720 }}>
        <div className="section-title" style={{ color: "var(--danger)" }}>The lines you never cross</div>
        <ul className="bible-list">{HARD_LINES.map((h, i) => <li key={i}>{h}</li>)}</ul>
      </div>
    </div>
  );
}

function SopChapter() {
  return (
    <div>
      <ChapterHead num="04" title={CRISIS_SOP.title} blurb={CRISIS_SOP.subtitle} />
      <div className="disclaimer-bar" style={{ marginBottom: 16, maxWidth: 760 }}>{DISCLAIMER_FULL[0]} {DISCLAIMER_FULL[2]}</div>
      <p style={{ fontSize: 14, maxWidth: 760 }}>{CRISIS_SOP.intro}</p>
      <div className="sop-grid">
        {CRISIS_SOP.sections.map((s) => (
          <div key={s.h} className="card" style={{ padding: 16 }}>
            <div className="section-title">{s.h}</div>
            <ul className="bible-list" style={{ marginBottom: 0 }}>{s.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 16, marginTop: 14, maxWidth: 760 }}>
        <div className="section-title">Key resources</div>
        {CRISIS_SOP.resources.map((r) => <div key={r.name} className="vrow"><span className="vk">{r.name}</span><span className="vv">{r.value}</span></div>)}
      </div>
    </div>
  );
}

function GlobalResults({ hits, onClear, onOpenBible }: { hits: { bible: BibleEntry[]; liners: any[] }; onClear: () => void; onOpenBible: () => void }) {
  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Search results</h1>
        <button className="btn ghost sm" style={{ marginLeft: 12 }} onClick={onClear}>Clear</button>
      </div>

      {hits.bible.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="section-title">📖 From the Bible</div>
          {hits.bible.map((e) => (
            <div key={e.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
              <strong>{e.acute && "🚨 "}{e.title}</strong>
              <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>{e.summary}</p>
            </div>
          ))}
          <button className="btn ghost sm" onClick={onOpenBible}>Open the full Bible →</button>
        </div>
      )}

      {hits.liners.length > 0 && (
        <div>
          <div className="section-title">✨ Silver Liners</div>
          <div className="liner-grid">
            {hits.liners.map(({ group, liner }: any, i: number) => (
              <div key={i} className="liner-card">
                <div className="liner-line">{liner.framing && <span className="liner-framing">{liner.framing} </span>}"{liner.line}"</div>
                <div className="liner-when"><strong>When:</strong> {liner.when}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hits.bible.length === 0 && hits.liners.length === 0 && <p className="muted">Nothing matched. Try a different word.</p>}
    </div>
  );
}
