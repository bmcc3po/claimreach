"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { dueCallAlerts, reconcileCallAlerts, type CallAlert } from "@/lib/call-alerts";
import "./call-alerts.css";

type Snapshot = { viewer: string; alerts: CallAlert[]; checkedAt: number };
type Signal = { viewer: string; id: string; at: number; fresh: CallAlert[] };
const PREFIX = "cr-call-alerts-v1";
const POLL_MS = 10000;
const read = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
};
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* In-memory tracking still works when storage is unavailable. */ }
};
async function locked(name: string, run: () => Promise<void>) {
  if (navigator.locks) await navigator.locks.request(name, { ifAvailable: true }, async lock => { if (lock) await run(); });
  else await run();
}

/** Mounted once at the root, outside individual case/page layouts. Audio is
 * unlocked by a real user gesture. Closed/suspended mobile browsers cannot
 * promise background alerts; no automatic calling or data writes occur here. */
export default function CallAlerts() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [soundReady, setSoundReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(false);
  const [banner, setBanner] = useState<Signal | null>(null);
  const [pulse, setPulse] = useState(0);
  const [due, setDue] = useState<CallAlert[]>([]);
  const context = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const viewer = useRef<string | null>(null);
  const snapshot = useRef<Snapshot | null>(null);
  const seen = useRef<string[]>([]);
  const lastSignal = useRef("");
  const lastSound = useRef("");
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  function play() {
    const ctx = context.current;
    if (!ctx || ctx.state !== "running" || mutedRef.current) return false;
    // A crisp two-part cash-register chime, synthesized locally (no download).
    for (const [offset, frequency] of [[0, 1318.5], [0.12, 1760], [0.12, 2637]]) {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      const start = ctx.currentTime + offset;
      oscillator.type = "sine"; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.09, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.start(start); oscillator.stop(start + 0.32);
    }
    return true;
  }

  async function armSound() {
    if (mutedRef.current) return;
    try {
      const Audio = window.AudioContext || (window as any).webkitAudioContext;
      if (!Audio) return;
      context.current ||= new Audio();
      await context.current!.resume();
      setSoundReady(context.current!.state === "running");
    } catch { setSoundReady(false); }
  }

  function show(signal: Signal) {
    if (signal.viewer !== viewer.current || signal.id === lastSignal.current || Date.now() - signal.at > 20000) return;
    lastSignal.current = signal.id;
    setBanner(signal);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 18000);
    setPulse(Date.now());
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulse(0), 1200);
    const sound = async () => {
      const key = `${PREFIX}:sound:${signal.viewer}`;
      if (lastSound.current === signal.id || read(key, "") === signal.id) return;
      if (play()) { lastSound.current = signal.id; write(key, signal.id); }
    };
    // Queue contenders: an unarmed tab must not prevent an armed tab sounding.
    if (navigator.locks) void navigator.locks.request(`${PREFIX}:sound:${signal.viewer}`, sound);
    else void sound();
  }

  async function reconcile(current: Snapshot) {
    await locked(`${PREFIX}:events:${current.viewer}`, async () => {
      if (viewer.current !== current.viewer) return;
      const key = `${PREFIX}:seen:${current.viewer}`;
      const result = reconcileCallAlerts(current.alerts, read<string[]>(key, seen.current), Date.now());
      seen.current = result.seen; write(key, result.seen); setDue(result.due);
      if (result.fresh.length) {
        const signal: Signal = { viewer: current.viewer, id: crypto.randomUUID(), at: Date.now(), fresh: result.fresh };
        write(`${PREFIX}:signal`, signal); show(signal);
      }
    });
  }

  useEffect(() => {
    setMounted(true);
    mutedRef.current = read(`${PREFIX}:muted`, false); setMuted(mutedRef.current);
    const arm = (event: Event) => {
      // The explicit sound button owns its gesture; auto-arming on pointerdown
      // would change Enable sound into Mute before the following click.
      if (event.target instanceof Element && event.target.closest(".ca-dock")) return;
      void armSound();
    };
    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    return () => {
      window.removeEventListener("pointerdown", arm); window.removeEventListener("keydown", arm);
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      void context.current?.close(); context.current = null;
    };
  }, []);

  useEffect(() => {
    // Authentication/setup/public signing pages never display staff alerts.
    if (/^\/(login|firm-login|auth|set-password|sign|signable|portal)(\/|$)/.test(pathname)) {
      viewer.current = null; snapshot.current = null; seen.current = [];
      setAllowed(false); setDue([]); setBanner(null); setPulse(0); return;
    }
    let alive = true;
    let nextAttempt = 0;
    const controllers = new Set<AbortController>();
    const accept = (value: Snapshot) => {
      if (!alive) return;
      if (viewer.current !== value.viewer) { seen.current = []; lastSignal.current = ""; setBanner(null); }
      viewer.current = value.viewer; snapshot.current = value;
      const currentDue = dueCallAlerts(value.alerts, Date.now());
      setAllowed(true); setError(false); setDue(currentDue);
      setBanner(prior => prior?.fresh.some(alert => alert.key === "test" || currentDue.some(item => item.key === alert.key)) ? prior : null);
    };
    const poll = async () => {
      if (busy.current || !navigator.onLine) return;
      busy.current = true;
      try {
        await locked(`${PREFIX}:poll`, async () => {
          if (!alive) return;
          const prior = viewer.current ? read<Snapshot | null>(`${PREFIX}:snapshot:${viewer.current}`, null) : null;
          if (prior && Date.now() - prior.checkedAt < POLL_MS) { accept(prior); await reconcile(prior); return; }
          if (Date.now() < nextAttempt) return;
          nextAttempt = Date.now() + POLL_MS;
          const controller = new AbortController(); controllers.add(controller);
          const timeout = setTimeout(() => controller.abort(), 15000);
          try {
            const response = await fetch("/api/calls/alerts", { cache: "no-store", signal: controller.signal });
            if (!alive) return;
            if (response.status === 401 || response.status === 403) {
              viewer.current = null; snapshot.current = null; seen.current = [];
              setAllowed(false); setBanner(null); setDue([]); setPulse(0); return;
            }
            if (!response.ok) throw new Error("queue unavailable");
            const value: Snapshot = await response.json();
            if (!value.viewer || !Array.isArray(value.alerts) || !Number.isFinite(value.checkedAt)) throw new Error("invalid queue response");
            accept(value); write(`${PREFIX}:snapshot:${value.viewer}`, value); await reconcile(value);
          } finally { clearTimeout(timeout); controllers.delete(controller); }
        });
      } catch { if (alive) setError(true); }
      finally { busy.current = false; }
    };
    const storage = (event: StorageEvent) => {
      if (!alive || !viewer.current) return;
      if (event.key === `${PREFIX}:snapshot:${viewer.current}`) {
        const value = read<Snapshot | null>(event.key, null);
        if (value?.viewer === viewer.current) accept(value);
      }
      if (event.key === `${PREFIX}:signal`) {
        const signal = read<Signal | null>(event.key, null); if (signal) show(signal);
      }
      if (event.key === `${PREFIX}:muted`) { mutedRef.current = read(event.key, false); setMuted(mutedRef.current); }
    };
    const wake = () => { void poll(); };
    const clock = setInterval(() => {
      const current = snapshot.current;
      // Never generate an alarm from stale queue data after a network failure.
      if (current && Date.now() - current.checkedAt <= 20000) void reconcile(current);
    }, 1000);
    // Frequent local checks avoid a second full polling interval when another
    // tab refreshes midway through ours. Shared snapshots still cap API reads.
    const timer = setInterval(wake, 2000);
    window.addEventListener("storage", storage); window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake); void poll();
    return () => {
      alive = false; clearInterval(timer); clearInterval(clock);
      for (const controller of controllers) controller.abort();
      window.removeEventListener("storage", storage); window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [pathname]);

  if (!mounted || !allowed) return null;
  const newCount = due.filter(alert => alert.kind === "new").length;
  const callbackCount = due.length - newCount;
  const freshNew = banner?.fresh.some(alert => alert.kind === "new");
  const first = banner?.fresh.find(alert => alert.kind === "new") || banner?.fresh[0];
  return createPortal(<>
    {pulse > 0 && <div key={pulse} className="ca-green-pulse" aria-hidden="true" />}
    <div className="ca-dock" aria-label="Call alerts">
      <a className={`ca-status${due.length ? " ca-status-due" : ""}`} href={`/app?tab=${newCount ? "new" : "callbacks"}`}>
        <span className={`ca-live${error ? " ca-live-offline" : ""}`} />
        <span>{error ? "Alerts reconnecting" : due.length ? `${newCount ? `${newCount} new` : ""}${newCount && callbackCount ? " · " : ""}${callbackCount ? `${callbackCount} callback${callbackCount === 1 ? "" : "s"} due` : ""}` : "Call alerts live"}</span>
      </a>
      <button type="button" className="ca-sound" aria-pressed={!muted && soundReady} onClick={async () => {
        if (!soundReady || muted) {
          mutedRef.current = false; setMuted(false); write(`${PREFIX}:muted`, false);
          await armSound(); play();
        } else { mutedRef.current = true; setMuted(true); write(`${PREFIX}:muted`, true); }
      }} title={muted ? "Turn call alert sound on" : soundReady ? "Mute call alert sound" : "Enable the cha-ching sound"}>
        {muted ? "Sound off" : soundReady ? "Sound on" : "Enable sound"}
      </button>
      <button type="button" className="ca-test" onClick={async () => {
        await armSound();
        show({ viewer: viewer.current!, id: crypto.randomUUID(), at: Date.now(), fresh: [{ key: "test", kind: "new", href: "/app?tab=new" }] });
      }}>Test alert</button>
    </div>
    {banner && first && <section className="ca-banner" role="status" aria-live="polite" aria-atomic="true">
      <span className="ca-banner-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m7 3 3 4-2 3c1.4 3 3 4.6 6 6l3-2 4 3c-1 4-4 5-7 3C8 17 4 13 3 7c-.5-2 1-4 4-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
      <div className="ca-banner-copy"><span className="ca-eyebrow">{first.key === "test" ? "PREVIEW · NO CALL CREATED" : freshNew ? "FIRST PRIORITY" : "CALLBACK DUE"}</span><strong>{freshNew ? "A new lead is ready." : "It’s time to call back."}</strong><span>{first.key === "test" ? "This is how your team’s alert will look and sound." : "Finish your current conversation, then open the call queue."}</span></div>
      <a href={first.key === "test" ? "/app?tab=new" : `/app?tab=${freshNew ? "new" : "callbacks"}`} className="ca-open">Open queue <span aria-hidden="true">↗</span></a>
      <button type="button" className="ca-dismiss" onClick={() => setBanner(null)} aria-label="Dismiss call alert">×</button>
    </section>}
  </>, document.body);
}
