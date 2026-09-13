"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { IngestResult, PlaybookHitId, TurnFile, TurnRole, WhyKey } from "@/lib/turn/types";
import { loadSeedFile, personByRole, primaryCarrier } from "@/lib/turn/seed";
import { CHIP_ASK, chipSends, classifyWhy } from "@/lib/turn/classify";
import { answerAsk, assignTask, landFile, queueLorResend, trySendSms } from "@/lib/turn/land";
import { TurnChrome, CallBar } from "./TurnChrome";
import { FileConcierge, KeepScreen, type ConciergeTurn } from "./TurnScreens";

const STORE = "claimturn.v2.";

function readStore(id: string): TurnFile | null {
  try {
    const raw = localStorage.getItem(STORE + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.id !== id) return null;
    return parsed as TurnFile;
  } catch {
    return null;
  }
}

function writeStore(file: TurnFile) {
  try { localStorage.setItem(STORE + file.id, JSON.stringify(file)); } catch { /* demo */ }
}

function roleForWhy(why: WhyKey | null): TurnRole {
  if (why === "adjuster" || why === "records") return "paralegal";
  return "attorney";
}

export default function TurnFileApp({ fileId }: { fileId: string }) {
  const router = useRouter();
  const seed = useMemo(() => loadSeedFile(fileId), [fileId]);
  const [file, setFile] = useState<TurnFile | null>(seed);
  const [why, setWhy] = useState<WhyKey | null>(null);
  const [role, setRole] = useState<TurnRole>("attorney");
  const [text, setText] = useState("");
  const [thread, setThread] = useState<ConciergeTurn[]>([]);
  const [armed, setArmed] = useState<PlaybookHitId[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [smsNote, setSmsNote] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(42);

  useEffect(() => {
    if (!seed) return;
    const saved = readStore(fileId);
    if (saved) setFile(saved);
  }, [fileId, seed]);

  useEffect(() => {
    if (why !== "client_phone") return;
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [why]);

  if (!seed || !file) {
    return (
      <div className="turn">
        <TurnChrome role="attorney" />
        <div className="turn-wrap">
          <h1 className="turn-h1">No file</h1>
          <p className="turn-sub">This demo only seeds Samuel Ortiz.</p>
          <button type="button" className="turn-btn" onClick={() => router.push("/turn")}>Back to desk</button>
        </div>
      </div>
    );
  }

  const live = file;

  function persist(next: TurnFile) {
    setFile(next);
    writeStore(next);
  }

  function reset() {
    localStorage.removeItem(STORE + fileId);
    setFile(seed);
    setWhy(null);
    setText("");
    setThread([]);
    setArmed([]);
    setErr(null);
    setSmsNote(null);
    setRole("attorney");
  }

  async function runIngest(fromText?: string, whyHint?: WhyKey | null) {
    const body = (fromText ?? text).trim();
    const hinted = whyHint ?? why;
    if (!body) {
      setErr("Type it. The box stays.");
      return;
    }
    const classified = classifyWhy(body, hinted);
    setWhy(classified);
    setRole(roleForWhy(classified));
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/turn/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: live.id, why: classified, text: body, file: live }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Ingest failed."); return; }
      const result = d as IngestResult;
      setThread((cur) => [...cur, { id: `t-${Date.now()}`, you: body, result }]);
      setArmed([]);
      setText("");
    } catch {
      setErr("Ingest failed.");
    } finally {
      setBusy(false);
    }
  }

  function pickChip(w: WhyKey) {
    setWhy(w);
    setRole(roleForWhy(w));
    setErr(null);
    if (!chipSends(w)) return;
    const ask = CHIP_ASK[w];
    setText(ask);
    void runIngest(ask, w);
  }

  function land(turnId?: string) {
    const turn = (turnId && thread.find((t) => t.id === turnId)) || thread[thread.length - 1];
    if (!turn) { setErr("Tell me first. Nothing lands until then."); return; }
    const next = landFile({ file: live, note: turn.result.note, patch: turn.result.patch, armedHits: armed });
    persist(next);
  }

  const client = personByRole(file, "client");
  const adjuster = personByRole(file, "adjuster");
  const carrier = primaryCarrier(file);
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  return (
    <div className="turn">
      <TurnChrome
        role={role}
        onRole={setRole}
        onReset={reset}
        rightNote={file.landed ? `KEEP · Ortiz ${file.fileNo}` : undefined}
      />
      {why === "client_phone" && (
        <CallBar
          tone="red"
          title={`CLIENT ON THE LINE · ${clock}`}
          detail={`${client ? `${client.firstName} ${client.lastName}` : "Client"} · ${client?.phone || ""} · bolt-on · JustCall matched this file`}
          stayLabel="Save and stay"
          endLabel="Land on file"
          onStay={() => { void runIngest(text, "client_phone"); }}
          onEnd={land}
        />
      )}
      {why === "adjuster" && (
        <CallBar
          tone="orange"
          title="ON A CALL · 11:42"
          detail={`${carrier?.name} · ${adjuster ? `${adjuster.firstName} ${adjuster.lastName}` : "Adjuster"} · ${adjuster?.phone || ""} · claim ${carrier?.claimNo || ""}`}
          stayLabel="Save note"
          endLabel="Land on file"
          onStay={() => void runIngest(text, "adjuster")}
          onEnd={land}
        />
      )}

      <FileConcierge
        file={file}
        why={why}
        text={text}
        busy={busy}
        err={err}
        thread={thread}
        armed={armed}
        onWhy={pickChip}
        onText={setText}
        onTell={() => { void runIngest(text, why); }}
        onToggle={(id) => setArmed((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])}
        onLand={land}
        belowThread={file.landed ? (
          <KeepScreen
            file={file}
            smsNote={smsNote}
            embedded
            onAsk={(k, v) => persist(answerAsk(live, k, v))}
            onAssign={(id) => persist(assignTask(live, id))}
            onQueueLor={() => persist(queueLorResend(live))}
            onSendSms={() => {
              const out = trySendSms(live);
              persist(out.file);
              setSmsNote(out.reason);
            }}
          />
        ) : null}
      />
    </div>
  );
}
