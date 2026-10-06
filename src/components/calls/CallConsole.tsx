"use client";
// The live call screen. CallEngine holds the call (ported from the approved
// canvas); this wrapper owns the network: autosave, e-sign, texting, dispo.
// Rule from AGENTS.md: never show saved after a failed write. A failed
// autosave shows "Not saved. Retrying." in the header until it lands.
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CallView from "./CallView";
import PostCallReview from "./PostCallReview";
import DeskPanel, { type DeskTab, type PreviewInfo, type PhoneRow } from "./DeskPanel";
import ClientContact from "./ClientContact";
import CaseSummary from "./CaseSummary";
import { WsHelper } from "./IntakeWorkspace";
import { popOutDialer } from "./JustCallDialer";
import { stateCodeOf } from "@/lib/mva-call/state";
import { agreementChoice } from "@/lib/mva-call/agreement-choice";
import { CallEngine, doiOf, type CallApi, type CallProps } from "@/lib/mva-call/engine";
import { callbackAt } from "@/lib/mva-call/dispo";
import { applyAnswerDelta, isAnswerObject, CALL_VIEW_KEYS } from "@/lib/mva-call/answer-merge";
import { SEND_HELD_MESSAGE } from "@/lib/mva-call/replacement";
import type { SendAttemptHold } from "@/lib/mva-call/replacement";
import { savedCallView } from "@/lib/mva-call/step-layout";
import { OPEN_DESK_FILE_EVENT } from "@/lib/mva-call/links";
import { officeDateUS } from "@/lib/office-clock";
import { activeCallPresence, type LiveCallPresence } from "@/lib/call-presence";
import { applyStorySuggestions, storySuggestions, type StorySuggestion } from "@/lib/mva-call/story-assist";
import { passengerFileLinks, type LinkedFile } from "@/lib/linked-files";

export interface ConsoleInit {
  leadId: string;
  /** The ONE matter this call works, pinned when the call opened (round 7). */
  claimId: string;
  callId: string | null;
  /** Server-confirmed signed disposition; reopen at the unsent final handoff. */
  signedDispoDone?: boolean;
  /** Raw canonical document, before the engine adds empty display defaults. */
  baseAnswers?: Record<string, any>;
  agreementId?: string | null;
  emergency?: { needsResign: boolean; status: string } | null;
  startedAt: number;
  /** Open the text sheet on arrival (from a text on the home screen). */
  openText?: boolean;
  /** Open File on arrival from the client-signed review queue. */
  openReview?: boolean;
  /** This campaign has an agreement packet the preview can draw. */
  canPreview?: boolean;
  /** This campaign's firm requires the full 9-digit SSN (no last-4). */
  ssnRequireFull?: boolean;
  /** Firm lines for a 3-way (routing rules with a transfer number). */
  threeWay?: { label: string; number: string }[];
  /** Other files on this same wreck (driver/passengers), linked both ways. */
  linked?: LinkedFile[];
  props: Omit<CallProps, "startedAt" | "now">;
}

type IdentityMeta = { saved: boolean; mode: "full" | "last4" | null; version: number; saved_at: string | null };

async function post(url: string, body: unknown, timeoutMs?: number): Promise<any> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.error) {
    const err: any = new Error(d?.error || (r.status >= 500
      ? `The server could not confirm the result (${r.status}). Check the file before trying again.`
      : `That did not go through (${r.status}).`));
    err.status = r.status; err.ended = !!d?.ended; err.conflict = !!d?.conflict; err.callId = d?.call_id;
    err.sendAttempt = d?.send_attempt ?? null;
    throw err;
  }
  return d;
}

function todayMDY(): string {
  return officeDateUS();
}

export default function CallConsole({ init }: { init: ConsoleInit }) {
  // The call renders local calendar labels and a second-by-second clock. The
  // server's timezone/time cannot produce the browser's initial text reliably.
  // Keep SSR and the first browser pass identical; initialize the engine and
  // its save/signing effects only after hydration. Signing dates use the
  // Pacific office day on both browser preview and server submission.
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  if (!ready) return <div className="cc-desk" aria-busy="true"><div className="cc-card" role="status" style={{ margin: 24 }}>Loading intake…</div></div>;
  return <MatterCallConsole key={`${init.leadId}:${init.claimId}`} init={init} />;
}

function MatterCallConsole({ init }: { init: ConsoleInit }) {
  const router = useRouter();
  const [, bump] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const callId = useRef<string | null>(init.callId);
  const agreementId = useRef<string | null>(init.agreementId ?? null);
  const sendStatusGeneration = useRef(0);
  const sendInFlight = useRef(false);
  const emergencyResign = useRef(false);
  const [needsResign, setNeedsResign] = useState(!!init.emergency?.needsResign);
  const [emergencyStatus, setEmergencyStatus] = useState(init.emergency?.status || "");
  const eng = useRef<CallEngine | null>(null);
  const lastSaved = useRef("");
  const answerBase = useRef<Record<string, any>>(isAnswerObject(init.baseAnswers) ? init.baseAnswers : isAnswerObject(init.props.saved) ? init.props.saved : {});
  const saveBlocked = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const saveInFlight = useRef<Promise<boolean> | null>(null);
  // Inbound texts already seen. Anything newer lights the badge.
  const seenInbound = useRef<number | null>(null);
  // Desktop: the call on the left, CarCure, texts, agreement and lead on the right.
  const [isDesk, setIsDesk] = useState(false);
  // iPad in landscape (or a narrower window): wide enough for three areas.
  // A touch screen gets the iPad layout even when it is as wide as a computer.
  const [wide, setWide] = useState(false);
  const [touch, setTouch] = useState(false);
  const [utilityOpen, setUtilityOpen] = useState(!!init.openReview);
  const [commandCollapsed, setCommandCollapsed] = useState(!init.openReview && !init.openText);
  const commandPanelId = useId();
  const utilityRef = useRef<HTMLDivElement | null>(null);
  // When the last autosave landed, for "Saved at 2:14 PM" (never shown after a failed write).
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const identityMeta = useRef<IdentityMeta | null>(null);
  const identityLoad = useRef<Promise<IdentityMeta> | null>(null);
  const identityWrite = useRef<Promise<boolean> | null>(null);
  // Plain digits stay in the mounted call only; never in answers or localStorage.
  const identitySavedDigits = useRef("");
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityError, setIdentityError] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [storyBusy, setStoryBusy] = useState(false);
  const storyInFlight = useRef(false);
  const [storyMessage, setStoryMessage] = useState("");
  const [storyError, setStoryError] = useState("");
  const [storyPlan, setStoryPlan] = useState<{ notes: string; rows: StorySuggestion[]; chosen: string[] } | null>(null);
  const [passengerLinks, setPassengerLinks] = useState<Record<string, string>>(() => passengerFileLinks(init.linked));
  const [, setIdentityRevision] = useState(0);
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState("");
  const [signatureCheckBusy, setSignatureCheckBusy] = useState(false);
  const [signatureCheckMessage, setSignatureCheckMessage] = useState("");
  const manualSignatureCheck = useRef(false);
  const [deskTab, setDeskTabState] = useState<DeskTab>(init.openReview ? "file" : init.openText ? "texts" : "file");
  const [focusLines, setFocusLines] = useState<{ key: string; n: number } | null>(null);
  // Only the JustCall dialer on this screen can say a call is live. Nothing else claims it.
  const [dialState, setDialState] = useState<string>("");
  const [liveCall, setLiveCall] = useState<LiveCallPresence | null>(null);
  const [presenceActorId, setPresenceActorId] = useState("");
  const [presenceBusy, setPresenceBusy] = useState(false);
  const [presenceError, setPresenceError] = useState("");
  const liveCallRef = useRef<LiveCallPresence | null>(null);
  const presenceActorRef = useRef("");
  useEffect(() => { liveCallRef.current = liveCall; presenceActorRef.current = presenceActorId; }, [liveCall, presenceActorId]);
  useEffect(() => {
    if (init.props.campaign !== "INNO MVA") return;
    let mounted = true;
    const key = new URLSearchParams({ lead_id: init.leadId, claim_id: init.claimId });
    async function refresh() {
      try {
        const current = liveCallRef.current;
        const own = !!current && current.by === presenceActorRef.current && !!activeCallPresence(current);
        const response = own
          ? await fetch("/api/calls/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lead_id: init.leadId, claim_id: init.claimId, action: "refresh" }) })
          : await fetch(`/api/calls/presence?${key}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not check call status.");
        if (mounted) { presenceActorRef.current = body.actor_id; liveCallRef.current = body.live_call || null; setPresenceActorId(body.actor_id); setLiveCall(body.live_call || null); setPresenceError(""); }
      } catch (error: any) { if (mounted) { setLiveCall(null); setPresenceError(error.message || "Could not check call status."); } }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [init.leadId, init.claimId, init.props.campaign]);
  async function markCall(action: "start" | "end") {
    setPresenceBusy(true); setPresenceError("");
    try {
      const response = await fetch("/api/calls/presence", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: init.leadId, claim_id: init.claimId, action }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Call status did not save.");
      presenceActorRef.current = body.actor_id; liveCallRef.current = body.live_call || null;
      setPresenceActorId(body.actor_id); setLiveCall(body.live_call || null);
    } catch (error: any) { setPresenceError(error.message || "Call status did not save."); }
    finally { setPresenceBusy(false); }
  }
  const contactSave = useRef<(() => Promise<boolean>) | null>(null);
  const saveContactNow = async () => !contactSave.current || await contactSave.current();
  const deskTextsOpen = useRef(false);
  const setDeskTab = (t: DeskTab) => { setCommandCollapsed(false); deskTextsOpen.current = t === "texts"; setDeskTabState(t); if (t === "texts") eng.current?.setState({ textUnread: 0 }); };

  function isHold(value: any): value is SendAttemptHold {
    return !!value && typeof value.id === "string" && ["reserved", "provider_pending", "uncertain"].includes(value.state)
      && typeof value.created_at === "string" && value.needs_reconciliation === true;
  }

  function updateSendGate(gate: "checking" | "clear" | "held" | "error", hold: SendAttemptHold | null = null, pax: Record<string, SendAttemptHold> = {}) {
    const engine = eng.current;
    if (!engine) return;
    const oldHoldNotice = engine.agreementHoldNotice();
    engine.props.esign.sendGate = gate;
    engine.props.esign.sendAttempt = hold;
    engine.props.esign.paxSendAttempts = pax;
    const stale = (message: string) => !!message && (message === oldHoldNotice || message === SEND_HELD_MESSAGE);
    engine.setState(gate === "clear" ? {
      send: { ...engine.state.send, error: stale(engine.state.send.error) ? "" : engine.state.send.error },
      file: { ...engine.state.file, error: stale(engine.state.file.error) ? "" : engine.state.file.error },
    } : {});
  }

  async function refreshSigningStatus(manual = false): Promise<{ status: string | null; error: string | null }> {
    if (manualSignatureCheck.current && !manual) return { status: null, error: null };
    const generation = ++sendStatusGeneration.current;
    const requestedAgreement = agreementId.current;
    try {
      const q = new URLSearchParams({ lead_id: init.leadId, claim_id: init.claimId, call_id: callId.current || "" });
      const response = await fetch(`/api/calls/esign?${q}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || "Could not verify agreement sends.");
      if (!("send_attempt" in data) || !("pax_send_attempts" in data)
        || (data.send_attempt !== null && !isHold(data.send_attempt))
        || !data.pax_send_attempts || typeof data.pax_send_attempts !== "object" || Array.isArray(data.pax_send_attempts)
        || !Object.values(data.pax_send_attempts).every(isHold)) throw new Error("Agreement send status could not be verified.");
      if (generation !== sendStatusGeneration.current || sendInFlight.current) return { status: null, error: null };
      const hold = data.send_attempt as SendAttemptHold | null;
      const pax = data.pax_send_attempts as Record<string, SendAttemptHold>;
      updateSendGate(hold || Object.keys(pax).length ? "held" : "clear", hold, pax);
      const engine = eng.current;
      if (!engine) return { status: null, error: "The intake is no longer open. Reopen the file to check its signature." };
      if (!emergencyResign.current) {
        setNeedsResign(!!data.emergency?.needs_resign);
        setEmergencyStatus(data.emergency?.status || "");
      }
      if (!emergencyResign.current && agreementId.current === requestedAgreement) {
        agreementId.current = data.agreement_id || data.id || agreementId.current;
        if (data.agreement) {
          engine.props.esign.templateKey = data.agreement.template_key || null;
          engine.props.esign.deliveryPhone = data.agreement.phone || null;
          engine.props.esign.deliveryVia = data.agreement.via || null;
          engine.setState({});
        }
        if (Array.isArray(data.templates)) engine.props.esign.templateKeys = data.templates.map((template: any) => String(template.key));
        if (data.status && data.status !== engine.state.send.status) engine.setState({ send: { ...engine.state.send, status: data.status } });
        if (data.complete && engine.state.file.agreement !== "done") engine.setState({ file: { ...engine.state.file, agreement: "done" } });
      }
      if (data.pax && Object.keys(data.pax).length) engine.setState({ file: { ...engine.state.file, pax: { ...engine.state.file.pax, ...data.pax } } });
      return { status: data.status || null, error: null };
    } catch (error: any) {
      if (generation === sendStatusGeneration.current) updateSendGate("error");
      return { status: null, error: error?.message || "Could not check the signature. Try again." };
    }
  }

  async function checkSignatureNow() {
    if (manualSignatureCheck.current) return;
    manualSignatureCheck.current = true;
    setSignatureCheckBusy(true);
    setSignatureCheckMessage("");
    try {
      const result = await refreshSigningStatus(true);
      setSignatureCheckMessage(result.error || (result.status === "signed"
        ? "Signature confirmed. Open the client-signed PDF and approve it below."
        : result.status === "opened" || result.status === "sent"
          ? "The signing service has not confirmed a signature yet. Stay with the client and check again."
          : "The agreement is not ready for signed-file review. Check its status and history before continuing."));
    } finally {
      manualSignatureCheck.current = false;
      setSignatureCheckBusy(false);
    }
  }

  function startSendOperation() {
    // Discard any status GET that started before this provider request.
    sendStatusGeneration.current++;
    sendInFlight.current = true;
    updateSendGate("checking");
  }

  function handleSendFailure(error: any, paxIndex?: number, paxKey?: string) {
    if (isHold(error?.sendAttempt)) {
      if (paxIndex == null) updateSendGate("held", error.sendAttempt);
      else updateSendGate("held", null, { [String(paxIndex)]: { ...error.sendAttempt, pax_key: error.sendAttempt.pax_key || paxKey || String(paxIndex) } });
    }
    else { updateSendGate("checking"); void refreshSigningStatus(); }
  }

  async function checkSendOutcome(attempt: SendAttemptHold, paxKey?: string) {
    if (init.props.agentRole !== "owner" || reconcileBusy) return;
    setReconcileBusy(true); setReconcileMessage("");
    try {
      const result = await post("/api/calls/esign/reconcile", {
        lead_id: init.leadId, claim_id: init.claimId, attempt_id: attempt.id,
        ...(paxKey ? { pax_key: paxKey } : {}),
      });
      setReconcileMessage(result.message || "Existing agreement recovered. No new link was sent.");
      await refreshSigningStatus();
      try { window.dispatchEvent(new CustomEvent("cr:esign-reconciled", { detail: { leadId: init.leadId, claimId: init.claimId } })); } catch { /* file panel may be closed */ }
    } catch (error: any) {
      setReconcileMessage(error?.message || "Could not verify the send. The hold remains; ask the owner to investigate.");
      await refreshSigningStatus();
    } finally { setReconcileBusy(false); }
  }

  async function loadIdentity(): Promise<IdentityMeta> {
    if (identityMeta.current) return identityMeta.current;
    if (!identityLoad.current) identityLoad.current = (async () => {
      const q = new URLSearchParams({ lead_id: init.leadId, claim_id: init.claimId });
      const response = await fetch(`/api/calls/identity?${q}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not check the saved SSN.");
      if (typeof data.saved !== "boolean" || !Number.isSafeInteger(data.version) || data.version < 0
        || (data.saved && (!(["full", "last4"].includes(data.mode)) || data.version < 1 || typeof data.saved_at !== "string"))
        || (!data.saved && (data.mode !== null || data.version !== 0 || data.saved_at !== null))) {
        throw new Error("Secure SSN status could not be verified.");
      }
      const meta: IdentityMeta = { saved: data.saved, mode: data.mode, version: data.version, saved_at: data.saved_at };
      identityMeta.current = meta;
      setIdentityRevision((n) => n + 1);
      return meta;
    })().finally(() => { identityLoad.current = null; });
    return identityLoad.current;
  }

  function identityInput() {
    const file = eng.current?.state.file || {};
    const ssn = String(file.ssn || "").replace(/\D/g, "");
    const mode: "full" | "last4" = init.ssnRequireFull || file.ssnMode !== "last4" ? "full" : "last4";
    return { ssn, mode, valid: mode === "full" ? ssn.length === 9 : ssn.length === 4 };
  }

  async function saveIdentityNow(): Promise<boolean> {
    // Serialize writes; a later edit may arrive while the first is in flight.
    if (identityWrite.current) await identityWrite.current;
    const input = identityInput();
    if (!input.ssn) { setIdentityError(""); return true; } // early SSN is optional
    if (!input.valid) { setIdentityError(input.mode === "full" ? "Enter all 9 digits before saving the SSN." : "Enter exactly 4 digits before saving the SSN."); return false; }
    if (identitySavedDigits.current === input.ssn && identityMeta.current?.mode === input.mode) return true;
    const work = (async () => {
      setIdentityBusy(true);
      try {
        const meta = await loadIdentity();
        const response = await fetch("/api/calls/identity", {
          method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
          body: JSON.stringify({ lead_id: init.leadId, claim_id: init.claimId, ssn: input.ssn, mode: input.mode, expected_version: meta.version }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 409) {
            identityMeta.current = null;
            try { await loadIdentity(); } catch { /* keep the server error */ }
          }
          throw new Error(data.error || "SSN was not saved securely. Try again.");
        }
        if (data.ok !== true || data.saved !== true || data.mode !== input.mode || !Number.isSafeInteger(data.version)
          || data.version <= meta.version || typeof data.saved_at !== "string") throw new Error("Secure SSN storage did not confirm the save. Try again.");
        identityMeta.current = { saved: true, mode: data.mode, version: data.version, saved_at: data.saved_at };
        identitySavedDigits.current = input.ssn;
        setIdentityError("");
        setIdentityRevision((n) => n + 1);
        return true;
      } catch (err: any) {
        setIdentityError(err?.message || "SSN was not saved securely. Try again.");
        return false;
      } finally { setIdentityBusy(false); }
    })();
    identityWrite.current = work;
    const ok = await work;
    identityWrite.current = null;
    if (!ok) return false;
    const latest = identityInput();
    if (latest.ssn && (latest.ssn !== input.ssn || latest.mode !== input.mode)) return saveIdentityNow();
    return true;
  }

  if (!eng.current) {
    const e = (): CallEngine => eng.current!;
    const leadId = init.leadId;
    const api: CallApi = {
      async sendAgreement(replacementReason?: string) {
        if (!(await saveContactNow())) { e().setState({ send: { ...e().state.send, error: "Client details have not saved. Retry the contact save before sending." } }); return; }
        const hold = e().agreementHoldNotice();
        if (hold) { e().setState({ send: { ...e().state.send, error: hold } }); return; }
        if (replacementReason && !agreementId.current) {
          e().setState({ send: { ...e().state.send, error: "The current agreement ID is missing. Refresh the file before sending a correction." } });
          return;
        }
        if (!(await saveIdentityNow())) {
          e().setState({ send: { ...e().state.send, error: "The SSN entered on this screen did not save securely. Correct it or clear it before sending." } });
          return;
        }
        const s = e().state;
        const choice = e().renderVals().contractChoice;
        startSendOperation();
        e().setState({ send: { ...s.send, status: "sending", error: "" } });
        post("/api/calls/esign", {
          lead_id: leadId, claim_id: init.claimId, call_id: callId.current,
          ...(replacementReason ? { replacement_agreement_id: agreementId.current, replacement_reason: replacementReason } : {}),
          emergency_resign: emergencyResign.current,
          signer_name: s.send.client, injured_name: s.send.who === "Someone else" ? s.send.injured : s.send.client,
          via: s.send.via, phone: s.send.phone, email: s.send.email, city: s.story.city, today: todayMDY(), doi: doiOf(s.story), dob: s.file.dob,
          nv_variant: choice.key === "NV_FLAT" ? "flat" : "tiered", nv_reason: choice.requiresReason ? s.send.nvReason : undefined,
        }).then((d) => {
          sendInFlight.current = false;
          const priorAgreementId = agreementId.current;
          const newAgreementId = d.agreement_id || d.id || null;
          if (replacementReason && (!newAgreementId || newAgreementId === priorAgreementId)) throw new Error("The corrected agreement was not confirmed. Refresh the file before another send.");
          updateSendGate("clear");
          agreementId.current = newAgreementId || priorAgreementId;
          e().props.esign.templateKey = d.template_key || choice.key || null;
          e().props.esign.deliveryPhone = s.send.phone; e().props.esign.deliveryVia = s.send.via;
          emergencyResign.current = false; setNeedsResign(false);
          e().setState({ send: { ...e().state.send, status: d.status || "sent", sentNameReview: newAgreementId && newAgreementId !== priorAgreementId ? "" : e().state.send.sentNameReview, error: d.warning || (d.owner_review_required ? "Correction sent. The original signed agreement is held for supervisor review before firm delivery." : "") } });
        }).catch((err) => {
          sendInFlight.current = false;
          handleSendFailure(err);
          e().setState({ send: { ...e().state.send, status: replacementReason ? s.send.status : "ready", error: err.message } });
        });
      },
      async sendPax(i: number) {
        if (!(await saveContactNow()) || !(await flushSave())) { e().setState({ file: { ...e().state.file, error: "Passenger details have not saved. Stay here and retry before sending." } }); return; }
        const issue = e().passengerSendIssue(i);
        if (issue) { e().setState({ file: { ...e().state.file, error: issue } }); return; }
        const hold = e().agreementHoldNotice();
        if (hold) { e().setState({ file: { ...e().state.file, error: hold } }); return; }
        const s = e().state;
        const choice = e().renderVals().contractChoice;
        const p = s.car.people[i] || {};
        const minor = p.age === "Under 18";
        const name = String(p.name || "").trim();
        if (!name) { e().setState({ file: { ...s.file, error: "Add the passenger's name on the Car step first." } }); return; }
        const mark = (v: string) => e().setState({ file: { ...e().state.file, pax: { ...e().state.file.pax, [i]: v } } });
        startSendOperation();
        mark("sending");
        post("/api/calls/esign", {
          lead_id: leadId, claim_id: init.claimId, call_id: callId.current, pax_index: i,
          signer_name: minor ? s.send.client : name, injured_name: name,
          // An adult passenger's agreement goes to THEIR cell or email; only a
          // minor's goes to the caller, who signs as parent or guardian. The
          // server refuses the caller's own destination for an adult unless
          // someone confirmed they share it (round 7).
          via: p.via || s.send.via, phone: minor ? s.send.phone : (p.cell || ""), email: minor ? s.send.email : (p.email || ""),
          city: s.story.city, today: todayMDY(), doi: doiOf(s.story),
          pax_key: p.pid || String(i), pax_minor: minor, pax_recipient_confirmed: !!p.shareOk,
          pax_dob: p.dob || null,
          pax_same_addr: p.sameAddr === "Same address",
          nv_variant: choice.key === "NV_FLAT" ? "flat" : "tiered", nv_reason: choice.requiresReason ? s.send.nvReason : undefined,
        }).then((result) => { sendInFlight.current = false; updateSendGate("clear"); if (result?.lead_id) setPassengerLinks((old) => ({ ...old, [p.pid || String(i)]: result.lead_id })); mark("sent"); }).catch((err) => {
          sendInFlight.current = false;
          handleSendFailure(err, i, p.pid || String(i));
          const pax = { ...e().state.file.pax }; delete pax[i];
          e().setState({ file: { ...e().state.file, pax, error: err.message } });
        });
      },
      async completeAgreement() {
        if (!(await saveContactNow())) { e().setState({ file: { ...e().state.file, error: "Client details have not saved. Retry the contact save before completing." } }); return; }
        const hold = e().agreementHoldNotice();
        if (hold) { e().setState({ file: { ...e().state.file, error: hold } }); return; }
        const f = e().state.file;
        e().setState({ file: { ...f, error: "" } });
        if (f.ssnRefused && f.ssn) {
          e().setState({ file: { ...e().state.file, error: "Clear the SSN entry before recording a refusal." } });
          return;
        }
        if (!(await saveIdentityNow())) {
          e().setState({ file: { ...e().state.file, error: "The SSN entered on this screen did not save securely. Correct it before completing." } });
          return;
        }
        post("/api/calls/esign/complete", { lead_id: leadId, claim_id: init.claimId, agreement_id: agreementId.current, dob: e().state.file.dob, use_saved_identity: !e().state.file.ssnRefused, ssn_refused: !!e().state.file.ssnRefused })
          .then(() => { identitySavedDigits.current = ""; e().setState({ file: { ...e().state.file, agreement: "done", ssn: "", error: "" } }); })
          .catch((err) => e().setState({ file: { ...e().state.file, error: err.message } }));
      },
      voidAgreement() {
        const hold = e().agreementHoldNotice();
        if (hold) { e().setState({ send: { ...e().state.send, error: hold } }); return; }
        const signed = e().state.send.status === "signed";
        const why = typeof window !== "undefined" ? window.prompt(signed
          ? "The PNC already signed this one. Why are you voiding it? (Owner or admin only. The signed copy stays in the file history.)"
          : "Why are you voiding this agreement? (For example: wrong agreement, wrong number.)") : null;
        if (!why || !why.trim()) return;
        post("/api/calls/esign/void", { lead_id: leadId, claim_id: init.claimId, id: agreementId.current, reason: why.trim() })
          .then((d) => e().setState({
            send: { ...e().state.send, status: "ready", error: d?.note ? `Voided. ${d.note}` : "Voided. Pick the right agreement and send it." },
            file: { ...e().state.file, agreement: "open" },
          }))
          .catch((err) => e().setState({ send: { ...e().state.send, error: err.message } }));
      },
      async resendLink(options) {
        const hold = e().agreementHoldNotice();
        if (hold) throw new Error(hold);
        const result = await post("/api/calls/esign/resend", { lead_id: leadId, claim_id: init.claimId, agreement_id: agreementId.current, ...options });
        e().setState({ text: { ...e().state.text, error: "" } });
        void loadComms();
        return result;
      },
      sendText(body: string) {
        const t = e().state.text;
        e().setState({ text: { ...t, draft: "", error: "", thread: t.thread.concat([{ from: "us", body, status: "Sending" }]) } });
        post("/api/calls/text", { lead_id: leadId, body })
          .then(() => {
            const cur = e().state.text;
            e().setState({ text: { ...cur, thread: cur.thread.map((m: any) => (m.status === "Sending" && m.body === body ? { ...m, status: "Sent" } : m)) } });
            return loadComms();
          })
          .catch((err) => {
            const cur = e().state.text;
            e().setState({ text: { ...cur, draft: body, error: err.message, thread: cur.thread.filter((m: any) => !(m.status === "Sending" && m.body === body)) } });
          });
      },
      saveDispo() {
        const d = e().state.dispo;
        if (d.saving) return;
        e().setState({ dispo: { ...d, saving: true, error: "" } });
        const at = callbackAt(d.when, d.at);
        // The call does not end over unsaved answers (Astra round 3): a failed
        // answers save blocks the dispo with a plain error instead.
        saveContactNow().then((contactSaved) => {
          if (!contactSaved) throw new Error("Client details have not saved. Retry the contact save before leaving intake.");
          return flushSave();
        }).then((saved) => {
          if (!saved) throw new Error(e().state.net?.saveError || "Your latest answers have not saved. Stay on this screen and try Save again; your entries are still here.");
          return post("/api/calls/dispo", {
          lead_id: leadId, claim_id: init.claimId, call_id: callId.current, dispo: d.pick, reasons: d.why,
          callback_at: at ? at.toISOString() : null, note: d.note,
          // The disposition records the call. The complete packet is sent
          // once, after the agent's final review in the next step.
          notify: [],
          });
        }).then((r) => {
          const note = r.email_error ? `Saved. The email did not send: ${r.email_error}` : "";
          e().setState({ saved: true, postCallReview: d.pick === "signed", dispo: { ...e().state.dispo, open: d.pick !== "signed", saving: false, saved: true, error: "", serverNote: note } });
        }).catch((err) => e().setState({ dispo: { ...e().state.dispo, saving: false, error: err.message } }));
      },
      home() { void saveContactNow().then((contactSaved) => contactSaved && saveIdentityNow()).then((secure) => secure && flushSave()).then((ok) => { if (ok) router.push("/dashboard"); }); },
      ask(text: string) {
        const q = String(text || "").trim();
        if (!q) return;
        e().setState({ askOut: "busy" });
        post("/api/calls/ask", { lead_id: leadId, question: q, city: e().state.story.city })
          .then((d) => e().setState({ askOut: { answer: d.answer } }))
          .catch((err) => e().setState({ askOut: { error: err.message } }));
      },
    };
    eng.current = new CallEngine({ ...init.props, esign: { ...init.props.esign, sendGate: "checking", sendAttempt: null, paxSendAttempts: {} }, startedAt: init.startedAt }, api);
    if (init.signedDispoDone) {
      eng.current.setState({ dispo: { ...eng.current.state.dispo, open: true, pick: "signed", saved: true } });
    }
    // The call opens in All questions on the first render. Retired layout
    // preferences are mapped there below; the engine still understands their
    // historical states so saved answers never need migration.
    eng.current.setView("chore");
    lastSaved.current = JSON.stringify(eng.current.persistable());
  }
  const engine = eng.current;
  engine.onChange = () => bump((x) => x + 1);
  engine.props.now = now;
  engine.props.agreementSuperseded = needsResign;

  useEffect(() => { void refreshSigningStatus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadIdentity().catch((err) => setIdentityError(err?.message || "Could not check the saved SSN.")); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const identityInputSnapshot = `${engine.state.file.ssnMode || ""}:${engine.state.file.ssn || ""}`;
  useEffect(() => {
    const input = identityInput();
    if (!input.ssn) { setIdentityError(""); return; }
    if (!input.valid || (identitySavedDigits.current === input.ssn && identityMeta.current?.mode === input.mode)) return;
    setIdentityError("");
    const timer = setTimeout(() => { void saveIdentityNow(); }, 650);
    return () => clearTimeout(timer);
  }, [identityInputSnapshot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const input = identityInput();
      if (!input.ssn || (identitySavedDigits.current === input.ssn && identityMeta.current?.mode === input.mode)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const follow = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const input = identityInput();
      if (!input.ssn || (identitySavedDigits.current === input.ssn && identityMeta.current?.mode === input.mode)) return;
      const destination = anchor.href;
      if (!destination || destination === window.location.href) return;
      // Intercept Next's client-side links too: beforeunload does not fire for
      // App Router navigation. Never lose a typed full SSN during review.
      event.preventDefault();
      event.stopPropagation();
      if (!input.valid) {
        setIdentityError("Finish the SSN entry or clear it before leaving this file.");
        window.alert("The SSN entry is incomplete and has not saved. Finish it or clear it before leaving this file.");
        return;
      }
      void saveIdentityNow().then((secure) => secure && flushSave()).then((saved) => {
        if (saved) window.location.assign(destination);
        else window.alert("The SSN or intake has not saved. Stay on this file and retry before leaving.");
      });
    };
    document.addEventListener("click", follow, true);
    return () => document.removeEventListener("click", follow, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Each agent's view (Guided, Full Intake, Q&A) is remembered on their device
  // and used on the next call. Applied after the first paint so the server
  // render and the phone agree.
  const viewKey = `cr-call-view:${init.props.agentName || "me"}`;
  engine.onViewChange = (vw: string) => { try { localStorage.setItem(viewKey, vw); } catch { /* private mode */ } };
  useEffect(() => {
    try {
      const pref = localStorage.getItem(viewKey);
      const chosen = savedCallView(pref);
      if (chosen !== engine.state.view) engine.setView(chosen);
    } catch { /* private mode */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Which layout. Full Intake: phone, iPad (three areas) or the desktop
  // workspace (three areas with the tools panel on the right). Simple
  // Chorelist is its own full-width form everywhere, so no panel beside it.
  // Same engine and the same answers in all of them.
  // One frame for every view (Guided, Collapsible, All questions): a computer
  // gets the caller on the left and the tools panel on the right, an iPad
  // sideways gets the caller and the helper, a phone gets one column.
  const v = engine.renderVals();
  v.reviewBusy = reviewBusy;
  v.reviewError = reviewError;
  v.returnToFinalQa = async () => {
    if (reviewBusy) return;
    setReviewBusy(true); setReviewError("");
    try {
      if (!(await saveContactNow()) || !(await saveIdentityNow()) || !(await flushSave())) throw new Error("Your latest answers have not saved. Stay here and retry.");
      engine.setState({ postCallReview: false, dispo: { ...engine.state.dispo, open: true } });
    } catch (error: any) { setReviewError(error?.message || "Could not save your review."); }
    finally { setReviewBusy(false); }
  };
  const mainHold = engine.props.esign.sendAttempt;
  const paxHolds = engine.props.esign.paxSendAttempts || {};
  v.reconcileActions = init.props.agentRole === "owner" && v.sendHold ? [
    ...(mainHold ? [{ label: "Check send outcome", go: () => void checkSendOutcome(mainHold) }] : []),
    ...Object.entries(paxHolds).filter(([, hold]) => !!hold.pax_key).map(([index, hold]) => ({
      label: `Check passenger ${Number(index) + 1} send outcome`, go: () => void checkSendOutcome(hold, hold.pax_key),
    })),
  ] : [];
  v.reconcileBusy = reconcileBusy;
  v.reconcileMessage = reconcileMessage;
  v.checkSignature = checkSignatureNow;
  v.signatureCheckBusy = signatureCheckBusy;
  v.signatureCheckMessage = signatureCheckMessage;
  const ws: "desk" | "ipad" | null = isDesk && !touch ? "desk" : wide ? "ipad" : null;
  const deskOn = ws === "desk";
  const sideOn = !!ws;
  const panelVisible = sideOn ? !commandCollapsed : utilityOpen;
  useEffect(() => {
    const openFile = () => { setDeskTab("file"); setUtilityOpen(true); };
    window.addEventListener(OPEN_DESK_FILE_EVENT, openFile);
    return () => window.removeEventListener(OPEN_DESK_FILE_EVENT, openFile);
    // The event reveals the already-pinned matter without navigation or a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadComms() {
    try {
      const r = await fetch(`/api/calls/comms?lead_id=${encodeURIComponent(init.leadId)}`);
      const d = await r.json();
      if (!r.ok || d.error) return;
      const cur = engine.state.text;
      const serverBodies = new Set((d.texts || []).filter((m: any) => m.from === "us").map((m: any) => m.body));
      const pending = cur.thread.filter((m: any) => (m.status === "Sending" || m.status === "Sent") && !serverBodies.has(m.body));
      const inbound = (d.texts || []).filter((m: any) => m.from === "them").length;
      const looking = cur.open || deskTextsOpen.current;
      if (seenInbound.current === null || looking) seenInbound.current = inbound;
      const unread = Math.max(0, inbound - (seenInbound.current ?? inbound));
      engine.setState({ text: { ...cur, thread: (d.texts || []).concat(pending) }, calls: d.calls || [], textUnread: looking ? 0 : unread });
    } catch { /* the sheet keeps what it had; the next poll tries again */ }
  }

  async function save(snap: string): Promise<boolean> {
    if (saving.current || saveBlocked.current) return false;
    const request = performSave(snap);
    saveInFlight.current = request;
    try { return await request; }
    finally { if (saveInFlight.current === request) saveInFlight.current = null; }
  }

  async function performSave(snap: string): Promise<boolean> {
    saving.current = true;
    const sentView = JSON.parse(snap);
    const baseView = JSON.parse(lastSaved.current);
    const baseAnswers = answerBase.current;
    const sentAnswers = applyAnswerDelta(baseView, sentView, baseAnswers);
    let acknowledged = false;
    try {
      const d = await post("/api/calls/save", { lead_id: init.leadId, claim_id: init.claimId, call_id: callId.current, post_call_correction: !!engine.state.dispo.saved, base_answers: baseAnswers, answers: sentAnswers, mode: engine.state.bare ? "bare" : engine.state.free ? "free" : "guided" }, 30000);
      callId.current = d.call_id || callId.current;
      const canonical = isAnswerObject(d.answers) ? d.answers : sentAnswers;
      // The acknowledgement may contain an import or another screen's unrelated
      // edits. Keep those, then reapply anything typed after this request began.
      const acknowledgedView = applyAnswerDelta(baseAnswers, canonical, sentView);
      // Another open screen's navigation is not this screen's current position.
      // Acknowledging it without moving the UI creates an endless save loop.
      for (const key of CALL_VIEW_KEYS) acknowledgedView[key] = sentView[key];
      const withPending = applyAnswerDelta(sentView, engine.persistable(), acknowledgedView);
      answerBase.current = canonical;
      lastSaved.current = JSON.stringify(acknowledgedView);
      const groups: Record<string, any> = {};
      for (const key of ["story", "body", "car", "send", "file"]) {
        if (isAnswerObject(withPending[key])) groups[key] = { ...engine.state[key], ...withPending[key] };
      }
      // SSN and signing/network state are absent from the persisted document;
      // overlay answer groups without replacing those runtime-only values.
      engine.setState(groups);
      // What this save put on the record goes to every open screen.
      const c = d.contact || {};
      if (Object.keys(c).length) {
        if (typeof c.phone === "string") engine.props.callerPhone = c.phone;
        if (typeof c.email === "string") engine.props.callerEmail = c.email;
        try { window.dispatchEvent(new CustomEvent("cr:record", { detail: { leadId: init.leadId, ...c } })); } catch { /* no listeners */ }
      }
      setSavedAt(Date.now());
      if (engine.state.net?.saveError) engine.setState({ net: { saveError: "" } });
      acknowledged = true;
      return true;
    } catch (err: any) {
      if (err?.callId) callId.current = err.callId;
      // A call already closed (another screen) or pinned to another matter is
      // not retried forever: say what happened and stop (round 7).
      if (err?.ended || err?.conflict) {
        saveBlocked.current = true;
        engine.setState({ net: { saveError: err.message } });
        return false;
      }
      const reason = err?.name === "TimeoutError" || err?.name === "AbortError"
        ? "The save is taking too long. Your entries are still here. Try Save again."
        : err?.message || "The connection was interrupted.";
      engine.setState({ net: { saveError: `Not saved: ${reason}` } });
      console.error("autosave failed", err?.message);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { void save(JSON.stringify(engine.persistable())); }, 4000);
      return false;
    } finally {
      saving.current = false;
      // A newer debounce can fire while this request is in flight and return
      // above. Its snapshot then stays unchanged, so the effect cannot wake it
      // again. Drain the latest state after success; failures keep their own
      // retry/backoff or conflict block instead of starting another write.
      if (acknowledged && !saveBlocked.current && JSON.stringify(engine.persistable()) !== lastSaved.current) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => { void save(JSON.stringify(engine.persistable())); }, 0);
      }
    }
  }

  async function flushSave(): Promise<boolean> {
    // Finishing a call must wait for the newest edit, not just the request that
    // was current when the button was pressed. A successful save can leave a
    // newer snapshot queued; recheck it before allowing the call to close.
    for (let i = 0; i < 16; i++) {
      if (saveBlocked.current) return false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (saveInFlight.current) {
        // Wait for the actual request. The former four-second polling budget
        // reported failure while a perfectly healthy slow save was still running.
        if (!(await saveInFlight.current)) return false;
        continue;
      }
      const snap = JSON.stringify(engine.persistable());
      if (snap === lastSaved.current && callId.current) return true;
      if (!(await save(snap))) return false;
    }
    return false;
  }

  async function suggestStory() {
    if (storyInFlight.current) return;
    storyInFlight.current = true; setStoryBusy(true); setStoryError(""); setStoryMessage(""); setStoryPlan(null);
    try {
      if (!(await flushSave())) throw new Error("The story has not saved yet. Retry saving, then use Fill from story.");
      const notes = String(engine.state.story.text || "").trim();
      const result = await post("/api/calls/story", { lead_id: init.leadId, claim_id: init.claimId, notes }, 30000);
      if (String(engine.state.story.text || "").trim() !== notes) throw new Error("Your notes changed. Press Fill from story again for fresh answers.");
      const rows = storySuggestions(result.suggestions, notes, engine.state);
      if (!rows.length) { setStoryMessage("No new answers to fill. Existing answers are kept; you can continue below."); return; }
      setStoryPlan({ notes, rows, chosen: rows.map(r => r.id) });
    } catch (err: any) { setStoryError(err?.message || "Could not read the story. Your notes are still here."); }
    finally { storyInFlight.current = false; setStoryBusy(false); }
  }
  async function acceptStory() {
    if (storyInFlight.current || !storyPlan) return;
    storyInFlight.current = true; setStoryBusy(true); setStoryError(""); setStoryMessage("");
    try {
      // Finish pending saves before filling blanks. The normal CAS save
      // refuses a conflict if another screen has changed one of these answers.
      if (!(await flushSave())) throw new Error("Your answers have not saved yet. Retry before applying the story.");
      const result = applyStorySuggestions(storyPlan.rows.filter(r => storyPlan.chosen.includes(r.id)), storyPlan.notes, engine.state);
      if (result.stale) throw new Error("Your notes changed. Press Fill from story again for fresh answers.");
      if (!result.applied.length) { setStoryPlan(null); setStoryMessage("No blank answers remain among your selections."); return; }
      engine.setState(result.groups);
      setStoryPlan(null);
      if (!(await flushSave())) throw new Error("The suggested answers are filled in but have not saved. Keep this file open and use Retry save.");
      setStoryMessage(`${result.applied.length} answer${result.applied.length === 1 ? "" : "s"} filled and saved. Review them as you continue.`);
    } catch (err: any) { setStoryError(err?.message || "Could not save these answers. Keep this file open and retry."); }
    finally { storyInFlight.current = false; setStoryBusy(false); }
  }

  // Clock.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Autosave, debounced, on every change to the answers.
  const snapshot = JSON.stringify(engine.persistable());
  useEffect(() => {
    if (snapshot === lastSaved.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void save(snapshot); }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  // Leaving the page (or the phone locking) still lands the last answers.
  useEffect(() => {
    const flush = () => {
      if (saveBlocked.current) return;
      const snap = JSON.stringify(engine.persistable());
      if (snap === lastSaved.current) return;
      const body = JSON.stringify({ lead_id: init.leadId, claim_id: init.claimId, call_id: callId.current, post_call_correction: !!engine.state.dispo.saved, base_answers: answerBase.current, answers: applyAnswerDelta(JSON.parse(lastSaved.current), JSON.parse(snap), answerBase.current) });
      try { navigator.sendBeacon("/api/calls/save", body); } catch { /* the debounced save already tried */ }
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", flush); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The inline contact editor saved the record: the call follows it at
  // once. Cell, email and home address are the record's on every screen
  // (hard-mapped, Brett Sep 28), never a separate copy the call keeps.
  useEffect(() => {
    const on = (e: any) => {
      const d = e?.detail || {};
      if (d.leadId !== init.leadId) return;
      engine.applyRecord({ phone: d.phone, email: d.email, addr: d.addr, name: d.name, previousName: d.previousName });
    };
    // An agreement voided inline opens the send again here.
    const onVoid = (e: any) => {
      const d = e?.detail || {};
      if (d.leadId !== init.leadId || (d.claimId && d.claimId !== init.claimId)) return;
      if (d.pax == null) engine.setState({ send: { ...engine.state.send, status: "ready", error: "Voided. Pick the right agreement and send it." }, file: { ...engine.state.file, agreement: "open" } });
      else { const pax = { ...(engine.state.file.pax || {}) }; delete pax[String(d.pax)]; engine.setState({ file: { ...engine.state.file, pax } }); }
    };
    window.addEventListener("cr:contact", on);
    window.addEventListener("cr:voided", onVoid);
    return () => { window.removeEventListener("cr:contact", on); window.removeEventListener("cr:voided", onVoid); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live Sent / Opened / Signed while an agreement is out.
  const s = engine.state;
  const paxKey = JSON.stringify(s.file.pax || {});
  useEffect(() => {
    const waiting = engine.props.esign.sendGate !== "clear" || ["sent", "opened"].includes(s.send.status)
      || Object.values(s.file.pax || {}).some((v: any) => v === "sent" || v === "opened");
    if (!waiting) return;
    const t = setInterval(() => { void refreshSigningStatus(); }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.send.status, paxKey, engine.props.esign.sendGate]);

  // Texts: load once, then every 5 seconds while the sheet is open.
  useEffect(() => {
    if (init.openText) engine.setState({ text: { ...engine.state.text, open: true } });
    void loadComms();
    // While the sheet is closed, check every 15 seconds so a text from the PNC lights the badge.
    const t = setInterval(() => { if (!engine.state.text.open) void loadComms(); }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!s.text.open) return;
    void loadComms();
    const t = setInterval(() => { void loadComms(); }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.text.open]);

  // The text sheet opens on the newest text and follows new ones in.
  const threadLen = s.text.thread.length;
  useEffect(() => {
    if (!s.text.open) return;
    const body = document.querySelector(".cc-sheet .cc-compose")?.closest(".cc-sheet")?.querySelector(".cc-sheet-b") as HTMLElement | null;
    if (body) body.scrollTop = body.scrollHeight;
  }, [s.text.open, threadLen]);

  // Layout changes move the panel visually without replacing its React parent.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1180px)");
    const mw = window.matchMedia("(min-width: 1000px)");
    const mt = window.matchMedia("(hover: none) and (pointer: coarse)");
    const on = () => { setIsDesk(mq.matches); setWide(mw.matches); setTouch(mt.matches); };
    on();
    [mq, mw, mt].forEach((m) => m.addEventListener("change", on));
    return () => [mq, mw, mt].forEach((m) => m.removeEventListener("change", on));
  }, []);
  useEffect(() => {
    deskTextsOpen.current = panelVisible && deskTab === "texts";
    // Arriving from a text on a desktop: the thread opens in the panel, not a sheet.
    if (sideOn && engine.state.text.open) { engine.setState({ text: { ...engine.state.text, open: false } }); setDeskTab("texts"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideOn, panelVisible, deskTab]);
  // Texts tab on screen: check every 5 seconds, same as the open sheet.
  useEffect(() => {
    if (!panelVisible || deskTab !== "texts") return;
    void loadComms();
    const t = setInterval(() => { void loadComms(); }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelVisible, deskTab]);

  useEffect(() => {
    if (sideOn || !utilityOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = utilityRef.current;
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setUtilityOpen(false); return; }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]')).filter((el) => el.getClientRects().length);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keys);
    return () => { document.removeEventListener("keydown", keys); previous?.focus(); };
  }, [sideOn, utilityOpen]);
  const phase = s.phase;

  const preview = previewInfo(engine.state, init, engine.props.esign.templateKeys ?? []);
  const view: any = { ...v, agreementId: agreementId.current, clientContact: <ClientContact leadId={init.leadId} claimId={init.claimId} saveRef={contactSave} />, leadId: init.leadId, claimId: init.claimId, canOverrideDownload: ["owner", "admin"].includes(init.props.agentRole || ""), previewHref: init.canPreview ? preview.href : null, onPreview: undefined, ws, onCall: dialState === "on-call", ringing: dialState === "ringing", ssnRequireFull: !!init.ssnRequireFull, linked: init.linked ?? [], passengerLinks,
    showPresence: init.props.campaign === "INNO MVA", liveCall: activeCallPresence(liveCall, now), presenceActorId, presenceBusy, presenceError, markCall };
  const identity = identityInput();
  view.storyAssist = init.props.campaign === "INNO MVA" ? {
    busy: storyBusy, message: storyMessage, error: storyError, plan: storyPlan,
    stale: !!storyPlan && String(engine.state.story.text || "").trim() !== storyPlan.notes,
    applyCount: storyPlan ? storySuggestions(storyPlan.rows.filter(row => storyPlan.chosen.includes(row.id)), storyPlan.notes, engine.state).length : 0,
    suggest: () => { void suggestStory(); }, apply: () => { void acceptStory(); },
    dismiss: () => setStoryPlan(null),
    toggle: (id: string) => setStoryPlan(p => p && ({ ...p, chosen: p.chosen.includes(id) ? p.chosen.filter(x => x !== id) : [...p.chosen, id] })),
  } : undefined;
  const identitySaved = !!identity.ssn && identitySavedDigits.current === identity.ssn && identityMeta.current?.mode === identity.mode;
  view.identityStatus = identityError
    ? `Secure SSN status: ${identityError}`
    : identityBusy || (identity.ssn && identity.valid && !identitySaved)
      ? "Saving SSN securely…"
      : identity.ssn && !identity.valid
        ? identity.mode === "full" ? "Enter all 9 digits to save securely." : "Enter all 4 digits to save securely."
        : identitySaved || (!identity.ssn && identityMeta.current?.saved)
          ? `${identityMeta.current?.mode === "full" ? "All 9 digits" : "Last 4"} securely saved. You can replace them by typing again.`
          : "SSN can be added before or after sending. It saves separately from intake answers.";
  view.identitySaveError = !!identityError;
  view.identityRetry = identity.ssn && identity.valid ? () => { void saveIdentityNow(); } : undefined;
  view.identitySavedMode = identityMeta.current?.saved ? identityMeta.current.mode : null;
  view.emergencyNotice = needsResign ? "An emergency packet is on this matter. A DocuSeal re-sign is still required; the original remains in history." : "";
  view.reviewAgreement = () => { setUtilityOpen(false); engine.jumpTo("signer"); };
  view.prepareResign = needsResign && emergencyStatus === "signed" ? () => {
    emergencyResign.current = true;
    engine.setState({ phase: "send", send: { ...engine.state.send, status: "ready", error: "" }, file: { ...engine.state.file, agreement: "open" } });
  } : undefined;
  // Autosave, said plainly. "Saving" while a change is on its way; a failed
  // write shows the engine's "Not saved. Retrying." instead, never "Saved".
  const pending = snapshot !== lastSaved.current;
  view.qaRevision = snapshot;
  view.qaUnsaved = pending || !!engine.state.net?.saveError;
  view.saveText = pending ? "Saving" : savedAt ? `Saved at ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "";
  view.saveNow = () => {
    if (snapshot === lastSaved.current && callId.current && !engine.state.net?.saveError) { setSavedAt(Date.now()); return; }
    void flushSave();
  };
  if (sideOn) {
    view.commandPanelId = commandPanelId;
    view.openCommandCenter = commandCollapsed ? () => setDeskTab(deskTab) : undefined;
    view.openPhone = () => setDeskTab("phone");
    view.openText = () => setDeskTab("texts");
    view.openSheet = () => setDeskTab("know");
    view.openCommon = () => { setDeskTab("know"); setFocusLines({ key: "common", n: Date.now() }); };
    view.openRamble = () => { setDeskTab("know"); setFocusLines({ key: "ramble", n: Date.now() }); };
    view.openRetainer = view.reviewAgreement;
    view.openFile = () => setDeskTab("file");
    view.openScripts = () => setDeskTab("know");
    view.textBadge = commandCollapsed && v.textBadge;
  } else {
    const openUtility = (tab: DeskTab) => { setDeskTab(tab); setUtilityOpen(true); };
    view.openCaseTools = () => openUtility("file");
    view.openFile = () => openUtility("file");
    view.openRetainer = view.reviewAgreement;
  }
  // Slide the divider to give the call or the panel more room. Remembered per
  // computer; double-click puts it back.
  const deskRef = useRef<HTMLDivElement | null>(null);
  const wasCommandCollapsed = useRef(commandCollapsed);
  useEffect(() => {
    if (sideOn && commandCollapsed && !wasCommandCollapsed.current) deskRef.current?.querySelector<HTMLButtonElement>(".ix-command-toggle")?.focus();
    else if (sideOn && wasCommandCollapsed.current) utilityRef.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
    wasCommandCollapsed.current = commandCollapsed;
  }, [sideOn, commandCollapsed]);
  const collapseCommand = () => { deskTextsOpen.current = false; setCommandCollapsed(true); };
  const DEFAULT_W = 900;
  // The width is saved under a new name since the call got its own left rail;
  // old saved widths were sized for the phone layout.
  const W_KEY = "cr-desk-call-w2";
  const setCallW = (w: number | null, save = false) => {
    const el = deskRef.current;
    if (!el) return;
    if (w == null) el.style.removeProperty("--call-w");
    else {
      // The panel keeps at least 360px (its column minimum) plus the 10px bar.
      const max = el.getBoundingClientRect().width - 372;
      const px = Math.round(Math.max(460, Math.min(max, w)));
      el.style.setProperty("--call-w", `${px}px`);
      if (save) { try { localStorage.setItem(W_KEY, String(px)); } catch { /* private mode */ } }
      return;
    }
    if (save) { try { localStorage.removeItem(W_KEY); } catch { /* private mode */ } }
  };
  useEffect(() => {
    if (!deskOn || ws) return;
    try { const w = Number(localStorage.getItem(W_KEY)); if (w > 0) setCallW(w); } catch { /* none saved */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskOn, ws]);
  // Wide enough, the call gets a left rail (caller, checks, steps) and the
  // question gets the middle. Narrow, it keeps the phone layout.
  useEffect(() => {
    const el = deskRef.current;
    const app = el?.querySelector(".cc-app") as HTMLElement | null;
    if (!deskOn || ws || !el || !app || typeof ResizeObserver === "undefined") { el?.classList.remove("cc-rail"); return; }
    const ro = new ResizeObserver(() => el.classList.toggle("cc-rail", app.getBoundingClientRect().width >= 760));
    ro.observe(app);
    return () => { ro.disconnect(); el.classList.remove("cc-rail"); };
  }, [deskOn, ws]);
  const startSlide = (ev: React.PointerEvent<HTMLDivElement>) => {
    const el = deskRef.current;
    if (!el) return;
    ev.preventDefault();
    const handle = ev.currentTarget;
    handle.setPointerCapture(ev.pointerId);
    el.classList.add("cc-sliding");
    const left = el.getBoundingClientRect().left;
    let last = 0;
    const move = (e: PointerEvent) => { last = e.clientX - left; setCallW(last); };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      el.classList.remove("cc-sliding");
      if (last) setCallW(last, true);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };
  const nudgeSlide = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    const cur = deskRef.current?.querySelector(".cc-app")?.getBoundingClientRect().width || DEFAULT_W;
    setCallW(cur + (ev.key === "ArrowRight" ? 32 : -32), true);
  };

  // Numbers for the dialer: the PNC's number first, then the firm lines for a 3-way.
  const herPhone = String(engine.state.send.phone || init.props.callerPhone || "").trim();
  const phones: PhoneRow[] = [
    ...(herPhone ? [{ label: v.callerFirst || "Caller", number: herPhone, pretty: prettyPhone(herPhone), kind: "caller" as const }] : []),
    ...(init.threeWay || []).map((t) => ({ label: t.label, number: t.number, pretty: prettyPhone(t.number), kind: "threeway" as const })),
  ];
  // Phone: the JustCall section at the top of the text sheet.
  view.phoneRows = phones;
  view.callOut = (n: string) => popOutDialer(n);
  view.copyNum = (n: string) => { try { navigator.clipboard.writeText(n); } catch { /* copy by hand */ } };

  const lead = init.props.lead ? { ...init.props.lead, name: engine.state.send.client || init.props.callerName, phone: init.props.callerPhone, email: init.props.callerEmail } : null;
  const fill = (t: string) => String(t || "").replace(/\{FIRM\}/g, init.props.firmSpoken).replace(/\{NAME\}/g, v.callerFirst || "");
  const casePanel = <DeskPanel key="case-panel" v={{ ...v, agentRole: init.props.agentRole, reviewAgreement: view.reviewAgreement, beforeQaResubmit: async () => (await saveContactNow()) && (await saveIdentityNow()) && (await flushSave()) }} tab={deskTab} setTab={setDeskTab} phase={phase} fill={fill} lead={lead}
    onCollapse={sideOn ? collapseCommand : undefined} panelId={commandPanelId}
    summary={<WsHelper v={view} />}
    caseSummary={<CaseSummary answerSnapshot={snapshot} claimantName={engine.props.callerName || ""} saveBad={!!view.saveBad} />}
    preview={init.canPreview ? preview : { href: null, checks: [{ label: "Agreement", value: "No agreement is set up for this campaign", ok: false }] }}
    focusLines={focusLines} phones={phones} leadId={init.leadId} claimId={init.claimId} onDialState={setDialState}
    story={{ city: String(engine.state.story.city || ""), crash: engine.crashDate() }} />;
  if (view.postCallReview && !view.dispoOpen) return <PostCallReview v={view} />;
  return (
    <div ref={deskRef} className={`cc-desk${deskOn ? " cc-desk-on ws-cockpit" : ws === "ipad" ? " cc-ipad-on" : ""}${sideOn && commandCollapsed ? " cc-command-collapsed" : ""}`}>
      <CallView v={view} />
      {deskOn && !ws && (
        <div className="cc-split" role="separator" aria-orientation="vertical" aria-label="Drag to resize the call and the panel" tabIndex={0}
          title="Drag to resize. Double-click to reset."
          onPointerDown={startSlide} onKeyDown={nudgeSlide} onDoubleClick={() => setCallW(null, true)} />
      )}
      {/* Keep one host and keyed panel through rotation and phone close/reopen.
          File drafts and the dialer iframe belong to this matter, not its layout. */}
      <div id={commandPanelId} ref={utilityRef} className={sideOn ? "cc-panel-host" : "cc-utility-dialog"} style={!panelVisible ? { display: "none" } : sideOn ? { display: "contents" } : { position: "fixed", inset: 0, zIndex: 90, background: "white", overflow: "auto" }} role={!sideOn && utilityOpen ? "dialog" : undefined} aria-modal={!sideOn && utilityOpen ? true : undefined} aria-label="Command center">
        {!sideOn && <button type="button" className="cc-btn" style={{ margin: 12 }} onClick={() => setUtilityOpen(false)}>Back to intake</button>}
        {casePanel}
      </div>
    </div>
  );
}

const prettyPhone = (raw: string) => { const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw; };

// What the agreement will say, from the call so far. The same values the Send
// button hands DocuSeal, so the preview cannot disagree with what goes out.
function previewInfo(s: any, init: ConsoleInit, templateKeys: string[]): PreviewInfo {
  const signer = String(s.send.client || "").trim();
  const injured = s.send.who === "Someone else" ? String(s.send.injured || "").trim() : signer;
  const city = String(s.story.city || "").trim();
  const code = stateCodeOf(city);
  const today = todayMDY();
  const doi = doiOf(s.story);
  const choice = agreementChoice(city, code === "NV" ? s.send.nvVariant : undefined, templateKeys);
  const viaText = s.send.via !== "Email";
  const to = viaText ? String(s.send.phone || "").trim() : String(s.send.email || "").trim();
  const checks: PreviewInfo["checks"] = [
    { label: "Agreement", value: choice.error || choice.label, ok: choice.available, ...(!code ? { spot: "city" } : {}) },
    { label: "Signer", value: signer || "Add the PNC's full name on Send", ok: signer.split(/\s+/).filter(Boolean).length >= 2, spot: "signer" },
    { label: "Injured person", value: injured || "Add the injured person's full name", ok: injured.split(/\s+/).filter(Boolean).length >= 2, spot: "signer" },
    { label: "Date of the wreck", value: doi || "Add it on Story", ok: !!doi, spot: "when" },
    { label: "Signing date", value: today, ok: true },
    { label: viaText ? "Text to" : "Email to", value: to ? (viaText ? prettyPhone(to) : to) : (viaText ? "Add the PNC's cell" : "Add the PNC's email"), ok: viaText ? to.replace(/\D/g, "").length >= 10 : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to), spot: "contact" },
    { label: "DOB and SSN", value: "Add before or after sending; the SSN saves securely", ok: false, later: true, spot: "file" },
  ];
  if (!choice.available || !signer) return { href: null, checks };
  const q = new URLSearchParams({ lead_id: init.leadId, claim_id: init.claimId, signer, injured: injured || signer, city, today, doi });
  if (choice.key === "NV_FLAT") q.set("nv_variant", "flat");
  return { href: `/api/calls/esign/preview?${q}`, checks };
}

