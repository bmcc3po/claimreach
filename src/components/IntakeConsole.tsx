"use client";
import { useMemo, useState, useEffect, useRef } from "react";
import { FIRM_CONFIGS, getFirmConfig, DEFAULT_FIRM_SLUG } from "@/lib/intake-console/config";
import { CASE_TYPES, questionByKey, questionsFor, type Question } from "@/lib/intake-console/questions";
import {
  evaluate, nextQuestionKey, buildSummary, questionApplies, registryKeyFor, modifiersFor,
  type Answers, type CaseTypeKey, type CallType, type Outcome,
} from "@/lib/intake-console/engine";
import {
  CALLER_DETAIL_SCRIPTS, NOT_TREATED_TELL, WRONGFUL_DEATH_SCRIPT, SIGN_SCRIPTS, POST_SIGN_FIELDS,
  REFER_SCRIPTS, DQ_CLOSES, SECONDARY_REVIEW_SCRIPTS, CALLBACK_SCRIPT, COMPLIANCE_RULES,
} from "@/lib/intake-console/scripts";
import GuidedStep, { Spoken, Note, Primary } from "@/components/guided/GuidedStep";
import Typeahead from "@/components/Typeahead";
import IncidentLocation from "@/components/IncidentLocation";

// ============================================================================
// Take a call. This is not a screening widget that gets promoted into a lead
// later — it IS the lead intake. The file opens the moment there is a real
// person on the line, and every answer writes against it as the agent goes.
// ============================================================================

type Stage = "greeting" | "callerid" | "calltype" | "details" | "casetype" | "questions" | "outcome";
type SignStage = "intro" | "identity" | "waiting" | "signed";

const CALL_TYPES: { value: CallType; label: string; sub: string; lead?: boolean }[] = [
  { value: "new_potential", label: "New Potential Client", sub: "Open a file and run the intake", lead: true },
  { value: "existing",      label: "Existing Client",      sub: "Route to their team" },
  { value: "non_client",    label: "Non-Client Matter",    sub: "Route to the firm" },
  { value: "not_legal",     label: "Not a Legal Matter",   sub: "Close politely" },
];

const IDENTITY_FIELDS: { key: string; label: string; type?: string; half?: boolean }[] = [
  { key: "first_name", label: "Legal first name", half: true },
  { key: "last_name",  label: "Legal last name",  half: true },
  { key: "dob",        label: "Date of birth", type: "date", half: true },
  { key: "phone",      label: "Best phone", half: true },
  { key: "email",      label: "Email" },
  { key: "addr1",      label: "Street address" },
  { key: "city",       label: "City", half: true },
  { key: "state",      label: "State", half: true },
  { key: "zip",        label: "ZIP", half: true },
];

export default function IntakeConsole({ agentName }: { agentName: string }) {
  const [firmSlug, setFirmSlug] = useState(DEFAULT_FIRM_SLUG);
  const cfg = useMemo(() => getFirmConfig(firmSlug), [firmSlug]);

  const [stage, setStage] = useState<Stage>("greeting");
  const [callerId, setCallerId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [callback, setCallback] = useState("");
  const [callType, setCallType] = useState<CallType | null>(null);
  const [caseType, setCaseType] = useState<CaseTypeKey | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [history, setHistory] = useState<string[]>([]);
  const [currentQ, setCurrentQ] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [outcomeSource, setOutcomeSource] = useState<"questions" | "calltype">("questions");

  const [file, setFile] = useState<{ lead_id: string; lead_no: string; claim_id: string; call_id: string } | null>(null);
  const [retainer, setRetainer] = useState<{ can: boolean; blocker: string | null; campaign: string | null }>({ can: false, blocker: null, campaign: null });
  // Only retainers tagged to this campaign. The agent may pick between them, but
  // cannot reach one that is not on the campaign.
  const [retainerOptions, setRetainerOptions] = useState<{ id: string; label: string; is_default: boolean }[]>([]);
  const [retainerId, setRetainerId] = useState<string | null>(null);

  const [signStage, setSignStage] = useState<SignStage | null>(null);
  const [client, setClient] = useState<Record<string, string>>({});
  const [sendVia, setSendVia] = useState<"sms" | "email">("sms"); // text is the proven channel; email is not configured yet
  const [sigStatus, setSigStatus] = useState<{ signed_count: number; total: number; all_signed: boolean } | null>(null);
  // Whether a signature ACTUALLY landed. Deliberately separate from signStage:
  // signStage says which screen we are on, and "skip signing" also lands on the
  // post-signature screen. Conflating the two marked unsigned files as signed.
  const [actuallySigned, setActuallySigned] = useState(false);
  const [postSign, setPostSign] = useState<Record<string, string>>({});
  const [ladderDone, setLadderDone] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const fill = (s: string) =>
    s.replace(/\[agent\]/g, agentName || "your name")
     .replace(/\[name\]/g, client.first_name || firstName || "there")
     .replace(/\[passenger\]/g, postSign.passenger || "your passenger")
     .replace(/\[X\]/g, cfg.referTurnaround || "___");

  async function api(body: any) {
    const r = await fetch("/api/console", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = await r.text();
    const d = t ? JSON.parse(t) : {};
    if (!r.ok) throw new Error(d.error || "request failed");
    return d;
  }

  // The file opens here, not at caller details: this is the first moment we know
  // both who is on the line AND what the file is. No campaign means no file.
  async function pickCaseType(t: CaseTypeKey) {
    setBusy(true); setErr("");
    try {
      const d = await api({
        op: "open", firm_slug: firmSlug, caller_id: callerId,
        first_name: firstName.trim(), callback, call_type: callType,
        case_type: t, registry_key: registryKeyFor(t),
      });
      if (d.error === "no_campaign") { setErr(d.message); setBusy(false); return; }
      setFile({ lead_id: d.lead_id, lead_no: d.lead_no, claim_id: d.claim_id, call_id: d.call_id });
      setRetainer({ can: !!d.can_send_retainer, blocker: d.retainer_blocker ?? null, campaign: d.campaign ?? null });
      const opts = d.retainers ?? [];
      setRetainerOptions(opts);
      setRetainerId((opts.find((o: any) => o.is_default) ?? opts[0])?.id ?? null);
      setClient((c) => ({ ...c, first_name: firstName.trim(), phone: callback }));
      setCaseType(t); setAnswers({}); setHistory([]);
      setCurrentQ(nextQuestionKey(t, {})); setStage("questions");
    } catch (e: any) { setErr(e?.message || "could not open the file"); }
    setBusy(false);
  }

  // Every answer is written as it lands, so a dropped call leaves a usable file.
  const saveTimer = useRef<any>(null);
  function persist(next: Answers, summary?: string) {
    if (!file) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api({ op: "save", claim_id: file.claim_id, call_id: file.call_id, answers: next, summary }).catch(() => {});
    }, 400);
  }

  function answerQuestion(key: string, value: any) {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    setHistory((h) => [...h, key]);
    persist(next);
    const ct = caseType!;
    const o = evaluate(ct, next, cfg);
    if (o) { finishWith(o, next); return; }
    setCurrentQ(nextQuestionKey(ct, next));
  }

  async function finishWith(o: Outcome, ans: Answers) {
    setOutcome(o); setOutcomeSource("questions"); setStage("outcome");
    setSignStage(o.disposition === "SIGN" ? "intro" : null);
    if (!file || !caseType) return;
    const summary = buildSummary(caseType, ans, o, client.first_name || firstName);
    try {
      await api({
        op: "disposition", lead_id: file.lead_id, call_id: file.call_id,
        disposition: o.disposition, reason: o.reason, close_key: o.closeKey,
        flags: o.flags, summary, modifiers: modifiersFor(caseType, ans),
      });
    } catch (e: any) { setErr(e?.message || "could not set the file status"); }
  }

  function pickCallType(t: CallType) {
    setCallType(t);
    if (t === "new_potential") { setStage("details"); return; }
    const r = cfg.callTypeRouting[t];
    setOutcome({ disposition: r.disposition, reason: r.reason, flags: [], closeKey: t === "not_legal" ? "not_legal" : undefined });
    setOutcomeSource("calltype"); setStage("outcome");
  }

  async function saveIdentityAndSend() {
    if (!file) return;
    setBusy(true); setErr("");
    try {
      await api({ op: "identity", lead_id: file.lead_id, client });
      const r = await fetch("/api/esign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "send_packet", lead_id: file.lead_id, live_call: true, retainer_id: retainerId,
          send_via: sendVia, signer_name: `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim(),
          signer_phone: client.phone, signer_email: client.email,
        }),
      });
      const t = await r.text();
      const d = t ? JSON.parse(t) : {};
      if (d.error) throw new Error(d.error);
      setSignStage("waiting");
    } catch (e: any) { setErr(e?.message || "could not send the retainer"); }
    setBusy(false);
  }

  // Poll for the signature while the agent works the buy-in ladder.
  useEffect(() => {
    if (signStage !== "waiting" || !file) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/console?lead_id=${file.lead_id}`);
        const d = await r.json();
        if (!alive) return;
        setSigStatus(d);
        if (d.all_signed) { setActuallySigned(true); setSignStage("signed"); }
      } catch {}
    };
    tick();
    const i = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(i); };
  }, [signStage, file]);

  async function finishCall() {
    if (!file || !outcome) { setDone(true); return; }
    setBusy(true);
    try {
      await api({
        op: "disposition", lead_id: file.lead_id, call_id: file.call_id,
        disposition: outcome.disposition, reason: outcome.reason, close_key: outcome.closeKey,
        flags: outcome.flags, post_sign: Object.keys(postSign).length ? postSign : null,
        // Only a real signature moves the file onto the signed track.
        status_key: actuallySigned ? "signed_wip" : undefined,
      });
    } catch (e: any) { setErr(e?.message || "could not close the file"); }
    setBusy(false); setDone(true);
  }

  function back() {
    setErr("");
    if (stage === "outcome") {
      if (signStage && signStage !== "intro") { setSignStage(signStage === "signed" ? "waiting" : "intro"); return; }
      if (outcomeSource === "calltype") { setOutcome(null); setStage("calltype"); return; }
      const h = [...history]; const last = h.pop(); setHistory(h);
      if (last) {
        const a = { ...answers }; delete a[last];
        setAnswers(a); setCurrentQ(last); setOutcome(null); setSignStage(null); setStage("questions");
      } else { setOutcome(null); setStage("casetype"); }
      return;
    }
    if (stage === "questions") {
      const h = [...history]; const last = h.pop();
      if (!last) { setStage("casetype"); setCurrentQ(null); return; }
      setHistory(h);
      const a = { ...answers }; delete a[last];
      setAnswers(a); setCurrentQ(last);
      return;
    }
    if (stage === "casetype") { setStage("details"); return; }
    if (stage === "details") { setStage("calltype"); return; }
    if (stage === "calltype") { setStage("callerid"); return; }
    if (stage === "callerid") { setStage("greeting"); return; }
  }

  function reset() { window.location.reload(); }

  const q: Question | undefined = currentQ && caseType ? questionByKey(caseType, currentQ) : undefined;
  const applicable = caseType ? questionsFor(caseType).filter((x) => questionApplies(caseType, x.key, answers)).length : 0;
  const remaining = Math.max(0, applicable - history.length - 1);

  if (done) {
    return (
      <div className="ic-root"><style>{CSS}</style>
        <div className="ic-card-wrap" style={{ textAlign: "center" }}>
          <h2 className="ic-q">Call complete</h2>
          <p className="ic-muted">{file ? `File ${file.lead_no} saved.` : "Saved."}</p>
          <Primary onClick={reset}>Take the next call</Primary>
        </div>
      </div>
    );
  }

  return (
    <div className="ic-root">
      <style>{CSS}</style>

      <header className="ic-head">
        <div>
          <div className="ic-eyebrow">Take a call</div>
          <h1>{cfg.firmName}</h1>
        </div>
        <div className="ic-headright">
          {stage === "greeting" ? (
            <select className="ic-firm" value={firmSlug} onChange={(e) => setFirmSlug(e.target.value)}>
              {Object.values(FIRM_CONFIGS).map((f) => <option key={f.slug} value={f.slug}>{f.firmName}</option>)}
            </select>
          ) : (
            <span className="ic-caller">{file ? <b>{file.lead_no}</b> : callerId}</span>
          )}
          {stage !== "greeting" && <button className="ic-btn ghost" onClick={back}>← Back</button>}
        </div>
      </header>

      {err && <div className="ic-banner err">{err}</div>}

      {stage === "greeting" && (
        <div className="ic-card-wrap">
          <Spoken>{fill(cfg.greeting)}</Spoken>
          <Note tone="hard">{cfg.recordingDisclosure}</Note>
          <Primary onClick={() => setStage("callerid")}>Disclosure read, continue</Primary>
        </div>
      )}

      {stage === "callerid" && (
        <div className="ic-card-wrap">
          <h2 className="ic-q">Paste the caller ID from JustCall</h2>
          <Note>This has to match the call recording. Nothing unlocks until it is filled.</Note>
          <input className="ic-input" autoFocus value={callerId} onChange={(e) => setCallerId(e.target.value)} placeholder="(702) 555-0134" />
          <Primary disabled={!callerId.trim()} onClick={() => setStage("calltype")}>Continue</Primary>
        </div>
      )}

      {stage === "calltype" && (
        <div className="ic-card-wrap">
          <h2 className="ic-q">What kind of call is this?</h2>
          <div className="ic-grid">
            {CALL_TYPES.map((c) => (
              <button key={c.value} className={`ic-card ${c.lead ? "lead" : ""}`} onClick={() => pickCallType(c.value)}>
                <span className="ic-card-t">{c.label}</span><span className="ic-card-s">{c.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {stage === "details" && (
        <div className="ic-card-wrap">
          <Spoken>{CALLER_DETAIL_SCRIPTS.nameAsk}</Spoken>
          <label className="ic-label">First name</label>
          <input className="ic-input" autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name only" />
          {firstName && <Spoken small>{fill(CALLER_DETAIL_SCRIPTS.firstNamePermission)}</Spoken>}
          <label className="ic-label">Best callback number</label>
          <input className="ic-input" value={callback} onChange={(e) => setCallback(e.target.value)} placeholder="(702) 555-0134" />
          <Primary disabled={!firstName.trim()} onClick={() => setStage("casetype")}>Continue</Primary>
        </div>
      )}

      {stage === "casetype" && (
        <div className="ic-card-wrap">
          <h2 className="ic-q">What is this about?</h2>
          <Note>Picking opens the file. Every answer after this saves as you go, so a dropped call still leaves a working file you can pick back up.</Note>
          <div className="ic-grid">
            {CASE_TYPES.filter((c) => cfg.caseTypes.includes(c.key)).map((c) => (
              <button key={c.key} disabled={busy} className={`ic-card ${c.key === "mva" ? "lead" : ""}`} onClick={() => pickCaseType(c.key)}>
                <span className="ic-card-t">{c.label}</span><span className="ic-card-s">{c.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {stage === "questions" && q && (
        <GuidedStep
          step={{ key: q.key, kind: q.kind as any, multiline: q.multiline, script: q.script, label: q.label, note: q.note, options: q.options }}
          value={answers[q.key]}
          index={history.length}
          remaining={remaining}
          onAnswer={(v) => answerQuestion(q.key, v)}
          extra={q.key === "willing" ? <Note tone="tell"><strong>If they hesitate, read this:</strong> {NOT_TREATED_TELL}</Note> : undefined}
        />
      )}

      {stage === "outcome" && outcome && (
        <OutcomeView
          outcome={outcome} cfg={cfg} fill={fill} signStage={signStage} setSignStage={setSignStage}
          client={client} setClient={setClient} sendVia={sendVia} setSendVia={setSendVia}
          retainer={retainer} sigStatus={sigStatus} postSign={postSign} setPostSign={setPostSign}
          actuallySigned={actuallySigned} setActuallySigned={setActuallySigned}
          retainerOptions={retainerOptions} retainerId={retainerId} setRetainerId={setRetainerId}
          ladderDone={ladderDone} setLadderDone={setLadderDone} busy={busy}
          onSend={saveIdentityAndSend} onFinish={finishCall} onBack={back} answers={answers} file={file}
        />
      )}

      <ComplianceRail />
    </div>
  );
}

// ---------------------------------------------------------------- outcome
function OutcomeView(p: any) {
  const { outcome, cfg, fill, signStage, setSignStage, client, setClient, sendVia, setSendVia,
          retainer, sigStatus, postSign, setPostSign, ladderDone, setLadderDone, busy,
          actuallySigned, setActuallySigned, retainerOptions, retainerId, setRetainerId,
          onSend, onFinish, onBack, answers, file } = p;
  const d: string = outcome.disposition;
  const tone = d === "SIGN" ? "sign" : d === "REFER" ? "refer" : d === "DISQUALIFY" ? "dq" : d === "SECONDARY_REVIEW" ? "sr" : "neutral";
  const sr = SECONDARY_REVIEW_SCRIPTS[(outcome.closeKey as keyof typeof SECONDARY_REVIEW_SCRIPTS)] ?? SECONDARY_REVIEW_SCRIPTS.default;
  const identityReady = client.first_name && client.last_name && client.email;

  return (
    <div className={`ic-outcome ${tone}`}>
      <div className="ic-out-head">
        <span className="ic-out-disp">{d.replace("_", " ")}</span>
        <span className="ic-out-reason">{outcome.reason}</span>
      </div>
      {outcome.flags?.length > 0 && (
        <div className="ic-flags">{outcome.flags.map((f: string) => <span key={f} className="ic-flag">{f}</span>)}</div>
      )}

      <div className="ic-out-body">
        {d === "SIGN" && signStage === "intro" && (
          <>
            <Spoken>{fill(cfg.signTransition)}</Spoken>
            <Note>{SIGN_SCRIPTS.nextStepNote}</Note>
            <Primary onClick={() => setSignStage("identity")}>Take their details</Primary>
          </>
        )}

        {d === "SIGN" && signStage === "identity" && (
          <>
            <h3 className="ic-h3">Details for the paperwork</h3>
            <div className="ic-idgrid">
              {IDENTITY_FIELDS.map((f) => (
                <label key={f.key} className={`ic-postfield ${f.half ? "half" : ""}`}>
                  <span>{f.label}</span>
                  <input type={f.type ?? "text"} value={client[f.key] ?? ""} onChange={(e) => setClient({ ...client, [f.key]: e.target.value })} />
                </label>
              ))}
            </div>
            {retainerOptions.length > 1 && (
              <>
                <h3 className="ic-h3">Which retainer</h3>
                <Note>These are the only retainers on this campaign. If the right one is not here, stop and check with a supervisor.</Note>
                <div className="ic-opts">
                  {retainerOptions.map((r: any) => (
                    <button key={r.id} className={`ic-opt ${retainerId === r.id ? "on" : ""}`} onClick={() => setRetainerId(r.id)}>{r.label}</button>
                  ))}
                </div>
              </>
            )}
            <h3 className="ic-h3">Send it</h3>
            <Spoken>{fill(SIGN_SCRIPTS.sending)}</Spoken>
            <Note>{SIGN_SCRIPTS.sendingNote}</Note>
            <div className="ic-send">
              <button className={`ic-toggle ${sendVia === "sms" ? "on" : ""}`} onClick={() => setSendVia("sms")}>Text it</button>
              <button className={`ic-toggle ${sendVia === "email" ? "on" : ""}`} onClick={() => setSendVia("email")} title="Email delivery is not configured yet">Email it</button>
            </div>
            {retainer.blocker && <Note tone="hard">{retainer.blocker} You can still finish and save the file, but nothing goes out to sign.</Note>}
            <Spoken>{fill(SIGN_SCRIPTS.nextStep)}</Spoken>
            <Note tone="hard">{SIGN_SCRIPTS.nextStepNote}</Note>
            <Primary disabled={!identityReady || busy || !retainer.can} onClick={onSend}>
              {busy ? "Sending…" : retainer.can ? `Send it by ${sendVia === "sms" ? "text" : "email"}` : "No document set up for this campaign"}
            </Primary>
            {!retainer.can && <button className="ic-btn wide" onClick={() => { setActuallySigned(false); setSignStage("signed"); }}>Skip signing, finish the file</button>}
          </>
        )}

        {d === "SIGN" && signStage === "waiting" && (
          <>
            <div className="ic-wait">
              <span className="ic-dot" />
              {sigStatus?.total
                ? <b>Waiting on signature · {sigStatus.signed_count} of {sigStatus.total} signed</b>
                : <b>Sent. Waiting on their signature…</b>}
            </div>
            <Note tone="hard">Stay on the line. Work the buy-in below while they sign. Do not hang up before it is signed.</Note>
            <h3 className="ic-h3">Insurance buy-in — each line waits for a yes</h3>
            <Note>{SIGN_SCRIPTS.ladderNote}</Note>
            {SIGN_SCRIPTS.ladder.map((line: string, i: number) => {
              const unlocked = i === 0 || ladderDone.includes(i - 1);
              const doneRung = ladderDone.includes(i);
              return (
                <div key={i} className={`ic-rung ${unlocked ? "" : "locked"} ${doneRung ? "done" : ""}`}>
                  <button className="ic-rung-btn" disabled={!unlocked}
                    onClick={() => setLadderDone(doneRung ? ladderDone.filter((x: number) => x !== i) : [...ladderDone, i])}>
                    {doneRung ? "✓" : i + 1}
                  </button>
                  <div>
                    <p>{fill(line)}</p>
                    {SIGN_SCRIPTS.ladderNotes?.[i] ? <span className="ic-rung-note">{SIGN_SCRIPTS.ladderNotes[i]}</span> : null}
                  </div>
                </div>
              );
            })}
            <Spoken>{fill(SIGN_SCRIPTS.reassurance)}</Spoken>
            <Spoken>{fill(SIGN_SCRIPTS.afterSignAsk).replace("[city]", answers.incident_city_state ?? "that area")}</Spoken>
            <button className="ic-btn wide" onClick={() => { setActuallySigned(true); setSignStage("signed"); }}>
              They signed, continue
            </button>
          </>
        )}

        {d === "SIGN" && signStage === "signed" && (
          <>
            {actuallySigned
              ? <div className="ic-wait done"><span className="ic-tick">✓</span><b>Signed. Now finish the file.</b></div>
              : <Note tone="hard">Nothing was signed on this call. The file stays unsigned and will not move onto the signed track.</Note>}
            <h3 className="ic-h3">{actuallySigned ? "After the signature" : "Finish the file"}</h3>
            {actuallySigned && <Note tone="hard">Only collect this now that it is signed.</Note>}
            <div className="ic-idgrid">
              {POST_SIGN_FIELDS.map((f) => (
                <label key={f.key} className={`ic-postfield ${f.half ? "half" : ""}`}>
                  <span>{f.label}{f.sensitive && <em> · sensitive</em>}</span>
                  {f.key === "incident_intersection" ? (
                    <IncidentLocation
                      value={postSign[f.key] ?? ""}
                      near={answers.incident_city_state as string | undefined}
                      onResolved={(r) => setPostSign({
                        ...postSign,
                        incident_intersection: r.formatted,
                        incident_county: r.county ?? "",
                        incident_agency: r.agency ?? "",
                      })}
                    />
                  ) : f.kind === "date" ? (
                    <input type="date" value={postSign[f.key] ?? ""}
                      onChange={(e) => setPostSign({ ...postSign, [f.key]: e.target.value })} />
                  ) : f.ref ? (
                    <Typeahead source={f.ref} className="ic-tain"
                      value={postSign[f.key] ?? ""}
                      onChange={(v: string) => setPostSign({ ...postSign, [f.key]: v })} />
                  ) : (
                    <input value={postSign[f.key] ?? ""} onChange={(e) => setPostSign({ ...postSign, [f.key]: e.target.value })} />
                  )}
                </label>
              ))}
            </div>
            {postSign.passenger && <Spoken>{fill(SIGN_SCRIPTS.passengerAsk)}</Spoken>}
            <Spoken>{fill(SIGN_SCRIPTS.closing)}</Spoken>
            <Note>{SIGN_SCRIPTS.closingNote}</Note>
            <Spoken>{fill(SIGN_SCRIPTS.beforeHangup)}</Spoken>
          </>
        )}

        {d === "REFER" && (
          <>
            {!cfg.referTurnaround && (
              <Note tone="hard">TURNAROUND NOT SET. The firm has not given the number for "you will hear back within X." Do not invent one — ask your supervisor before you say it.</Note>
            )}
            <Spoken>{fill(REFER_SCRIPTS.main)}</Spoken>
            <Note>{REFER_SCRIPTS.ifAskedNote}</Note>
            <Spoken small>{REFER_SCRIPTS.ifAsked}</Spoken>
            <Spoken>{REFER_SCRIPTS.closing}</Spoken>
          </>
        )}

        {d === "DISQUALIFY" && (
          <>
            <Spoken>{fill(DQ_CLOSES[outcome.closeKey ?? ""]?.close ?? DQ_CLOSES.presence.close)}</Spoken>
            {DQ_CLOSES[outcome.closeKey ?? ""]?.note && <Note>{DQ_CLOSES[outcome.closeKey ?? ""]!.note}</Note>}
          </>
        )}

        {d === "SECONDARY_REVIEW" && (
          <>
            <Note tone="hard">{sr.banner}</Note>
            <Note>{sr.note}</Note>
            {answers?.authority === "deceased" && <Spoken>{WRONGFUL_DEATH_SCRIPT}</Spoken>}
          </>
        )}

        {d === "CALLBACK" && <Spoken>{CALLBACK_SCRIPT}</Spoken>}
        {d === "TRANSFER" && <Spoken>One moment, let me get you to the right person.</Spoken>}
      </div>

      <div className="ic-out-foot">
        <button className="ic-btn ghost" onClick={onBack}>← Back</button>
        <div className="spacer" />
        {file && <span className="ic-filenote">File {file.lead_no} · saving as you go</span>}
        {(d !== "SIGN" || signStage === "signed") && (
          <button className="ic-btn solid" disabled={busy} onClick={onFinish}>{busy ? "Saving…" : "Finish call"}</button>
        )}
      </div>
    </div>
  );
}

function ComplianceRail() {
  const [open, setOpen] = useState(false);
  return (
    <div className="ic-comp">
      <button className="ic-comp-head" onClick={() => setOpen(!open)}>
        <span>Compliance</span><span>{open ? "Hide" : "Show"}</span>
      </button>
      {open && <ul>{COMPLIANCE_RULES.map((r) => <li key={r}>{r}</li>)}</ul>}
    </div>
  );
}

const CSS = `
.ic-root { max-width:900px; margin:0 auto; padding:22px 18px 90px; }
.ic-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; gap:14px; }
.ic-eyebrow { font-size:11px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-faint); }
.ic-head h1 { font-size:24px; font-weight:800; margin:3px 0 0; letter-spacing:-.02em; }
.ic-headright { display:flex; align-items:center; gap:10px; }
.ic-firm { padding:8px 10px; border-radius:9px; border:1px solid var(--line); background:var(--surface); font:inherit; }
.ic-caller { font-variant-numeric:tabular-nums; font-weight:600; color:var(--ink-soft); font-size:14px; }
.ic-banner { padding:11px 16px; border-radius:10px; margin-bottom:14px; font-size:14px; font-weight:600; }
.ic-banner.err { background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; }
.ic-muted { color:var(--ink-soft); }

.ic-card-wrap { background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:26px; }
.ic-progress { font-size:11.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-faint); margin-bottom:12px; display:flex; gap:10px; align-items:center; }
.ic-remaining { background:var(--surface-2); border:1px solid var(--line); padding:2px 8px; border-radius:999px; letter-spacing:.02em; }
.ic-vital { background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:2px 8px; border-radius:999px; letter-spacing:.02em; }
.ic-q { font-size:22px; font-weight:750; margin:0 0 8px; letter-spacing:-.02em; }

.ic-spoken { border-left:4px solid #2563eb; background:#eff5ff; border-radius:0 12px 12px 0; padding:16px 18px; margin:14px 0; }
.ic-spoken-tag { font-size:10px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:#1d4ed8; }
.ic-spoken p { margin:6px 0 0; font-size:19px; line-height:1.5; font-weight:600; color:#0d1420; }
.ic-spoken.sm p { font-size:16px; font-weight:500; }

.ic-note { border-left:4px solid #d9982a; background:#fff8ec; border-radius:0 10px 10px 0; padding:11px 14px; margin:12px 0; }
.ic-note.hard { border-left-color:#dc2626; background:#fef2f2; }
.ic-note.tell { border-left-color:#7c3aed; background:#f5f3ff; }
.ic-note-tag { font-size:9.5px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:#a16207; }
.ic-note.hard .ic-note-tag { color:#b91c1c; }
.ic-note.tell .ic-note-tag { color:#6d28d9; }
.ic-note p { margin:4px 0 0; font-size:13.5px; line-height:1.5; color:var(--ink-soft); }

.ic-opts { display:flex; flex-direction:column; gap:9px; margin-top:18px; }
.ic-opt { text-align:left; padding:16px 18px; font-size:16.5px; font-weight:600; border:1.5px solid var(--line);
  border-radius:12px; background:var(--surface); cursor:pointer; transition:all .08s; color:var(--ink); }
.ic-opt:hover { border-color:#2563eb; background:#f5f9ff; transform:translateX(2px); }
.ic-opt.on { border-color:#2563eb; background:#eff5ff; }
.ic-check { display:inline-block; width:20px; color:#2563eb; font-weight:800; }

.ic-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:16px; }
@media (max-width:640px){ .ic-grid{ grid-template-columns:1fr; } }
.ic-card { display:flex; flex-direction:column; gap:4px; text-align:left; padding:20px; border:1.5px solid var(--line);
  border-radius:14px; background:var(--surface); cursor:pointer; transition:all .08s; }
.ic-card:hover { border-color:#2563eb; transform:translateY(-1px); }
.ic-card.lead { border-color:#2563eb; background:#eff5ff; }
.ic-card-t { font-size:16.5px; font-weight:700; color:var(--ink); }
.ic-card-s { font-size:12.5px; color:var(--ink-faint); }

.ic-input { width:100%; padding:14px 16px; font-size:17px; border:1.5px solid var(--line); border-radius:12px;
  background:var(--surface-2); font-family:inherit; color:var(--ink); margin:8px 0 4px; }
.ic-input.area { font-size:15px; line-height:1.55; resize:vertical; }
.ic-label { display:block; font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-faint); margin-top:14px; }

.ic-btn { padding:11px 18px; border-radius:10px; border:1px solid var(--line); background:var(--surface);
  font:inherit; font-weight:650; cursor:pointer; color:var(--ink); }
.ic-btn.ghost { background:transparent; }
.ic-btn.solid { background:#0d1420; color:#fff; border-color:#0d1420; }
.ic-btn.solid:disabled { opacity:.35; cursor:not-allowed; }
.ic-btn.wide { width:100%; margin-top:12px; padding:15px; font-size:16px; }

.ic-outcome { border-radius:18px; overflow:hidden; border:1px solid var(--line); background:var(--surface); }
.ic-out-head { padding:20px 24px; color:#fff; }
.ic-outcome.sign .ic-out-head { background:#15803d; }
.ic-outcome.refer .ic-out-head { background:#1d4ed8; }
.ic-outcome.dq .ic-out-head { background:#4b5563; }
.ic-outcome.sr .ic-out-head { background:#b91c1c; }
.ic-outcome.neutral .ic-out-head { background:#334155; }
.ic-out-disp { display:block; font-size:26px; font-weight:850; letter-spacing:-.02em; }
.ic-out-reason { display:block; font-size:14px; opacity:.9; margin-top:3px; }
.ic-flags { display:flex; gap:7px; flex-wrap:wrap; padding:12px 24px 0; }
.ic-flag { font-size:11.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em;
  background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:4px 10px; border-radius:999px; }
.ic-out-body { padding:16px 24px 6px; }
.ic-h3 { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-faint); margin:22px 0 8px; }

.ic-wait { display:flex; align-items:center; gap:10px; padding:14px 16px; border-radius:12px; background:#eff6ff; border:1px solid #bfdbfe; font-size:15px; margin-bottom:6px; }
.ic-wait.done { background:#f0fdf4; border-color:#bbf7d0; }
.ic-dot { width:10px; height:10px; border-radius:50%; background:#2563eb; animation:icp 1.2s infinite; }
.ic-tick { color:#15803d; font-weight:900; }
@keyframes icp { 0%,100%{opacity:1} 50%{opacity:.25} }

.ic-since { display:flex; flex-direction:column; gap:3px; margin-top:12px; padding:11px 14px;
  border-radius:10px; border:1px solid var(--line); background:var(--surface-2); }
.ic-since b { font-size:16px; }
.ic-since span { font-size:12.5px; color:var(--ink-soft); line-height:1.45; }
.ic-since.le30 { border-color:#bbf7d0; background:#f0fdf4; }
.ic-since.mid  { border-color:#fde68a; background:#fffbeb; }
.ic-since.old  { border-color:#fecaca; background:#fef2f2; }
.ic-rung { display:flex; gap:12px; align-items:flex-start; padding:11px 0; border-bottom:1px solid var(--line); }
.ic-rung.locked .ic-rung-btn { opacity:.4; }
.ic-rung.locked p { color:var(--ink-soft); }
.ic-rung.locked .ic-rung-note { opacity:.85; }
.ic-rung.done p { color:var(--ink-faint); }
.ic-rung-note { display:block; margin-top:4px; font-size:12.5px; font-style:italic; color:#a16207; line-height:1.45; }
.ic-rung p { margin:0; font-size:16px; line-height:1.5; font-weight:600; }
.ic-rung-btn { flex-shrink:0; width:30px; height:30px; border-radius:50%; border:1.5px solid var(--line);
  background:var(--surface); font-weight:800; cursor:pointer; color:var(--ink-soft); }
.ic-rung.done .ic-rung-btn { background:#15803d; color:#fff; border-color:#15803d; }

.ic-idgrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
@media (max-width:640px){ .ic-idgrid{ grid-template-columns:1fr; } }
.ic-postfield { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:650; color:var(--ink-soft); grid-column:span 2; }
.ic-postfield.half { grid-column:span 1; }
.ic-postfield em { color:#b91c1c; font-style:normal; font-weight:700; }
.ic-postfield input, .ic-tain { width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); font:inherit; font-size:15px; color:var(--ink); }
.ic-send { display:flex; gap:8px; }
.ic-toggle { flex:1; padding:12px; border-radius:10px; border:1.5px solid var(--line); background:var(--surface); font:inherit; font-weight:650; cursor:pointer; color:var(--ink); }
.ic-toggle.on { border-color:#2563eb; background:#eff5ff; }

.ic-out-foot { display:flex; align-items:center; gap:10px; padding:16px 24px; border-top:1px solid var(--line); background:var(--surface-2); }
.ic-out-foot .spacer { flex:1; }
.ic-filenote { font-size:12px; color:var(--ink-faint); }

.ic-comp { margin-top:20px; border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow:hidden; }
.ic-comp-head { width:100%; display:flex; justify-content:space-between; padding:11px 16px; background:transparent;
  border:0; font:inherit; font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-faint); cursor:pointer; }
.ic-comp ul { margin:0; padding:0 20px 16px 34px; }
.ic-comp li { font-size:13px; color:var(--ink-soft); line-height:1.65; }
`;
