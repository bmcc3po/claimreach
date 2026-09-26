"use client";
// JustCall's own dialer, embedded (same thing their Dialer SDK does, without the
// extra package): an iframe of app.justcall.io/dialer. The agent signs in to
// JustCall inside it once. Calls go out from the JustCall line, record, and land
// on the file through the JustCall webhook like any other call. Transfers and
// adding a third person happen with JustCall's own buttons inside the dialer.
//
// Leaving the page ends a call in this box. For a long call or a 3-way, "Pop
// out" opens the same dialer in its own window that survives moving around.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

const JC_ORIGIN = "https://app.justcall.io";
const JC_DIALER = `${JC_ORIGIN}/dialer`;

export interface JustCallDialerHandle { dial: (number: string) => void }
export type DialerState = "loading" | "signed-out" | "ready" | "ringing" | "on-call";

/** "(205) 555-0142" -> "+12055550142". Leaves anything else as typed. */
export function e164(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return String(raw || "").trim();
}

/** The JustCall dialer in its own window, with the number filled in. */
export function popOutDialer(number?: string) {
  const url = number ? `${JC_DIALER}?numbers=${encodeURIComponent(e164(number))}` : JC_DIALER;
  window.open(url, "jc-dialer", "width=385,height=665,location=no");
}

const JustCallDialer = forwardRef<JustCallDialerHandle, { onState?: (s: DialerState) => void }>(function JustCallDialer({ onState }, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [state, setState] = useState<DialerState>("loading");
  const pending = useRef<{ n: string; at: number } | null>(null);

  const set = (s: DialerState) => { setState(s); onState?.(s); };
  const post = (msg: any) => { try { frame.current?.contentWindow?.postMessage(msg, JC_ORIGIN); } catch { /* frame not ready */ } };

  useImperativeHandle(ref, () => ({
    dial(number: string) {
      const n = e164(number);
      if (!n) return;
      post({ type: "dial-number", phoneNumber: n });
      // Not signed in yet: dial it the moment they are (within a minute).
      pending.current = state === "loading" || state === "signed-out" ? { n, at: Date.now() } : null;
    },
  }), [state]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== JC_ORIGIN || !ev.data || typeof ev.data !== "object") return;
      const { name, data } = ev.data as { name?: string; data?: any };
      if (name === "logged-in-status" || name === "is-logged-in") {
        const inNow = name === "is-logged-in" ? String(data) === "true" : !!data?.logged_in;
        set(inNow ? "ready" : "signed-out");
        if (inNow && pending.current && Date.now() - pending.current.at < 60000) post({ type: "dial-number", phoneNumber: pending.current.n });
        if (inNow) pending.current = null;
      } else if (name === "call-ringing") set("ringing");
      else if (name === "call-answered") set("on-call");
      else if (name === "call-ended") set("ready");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <iframe
      ref={frame}
      className="cc-jc-frame"
      title="JustCall dialer"
      src={JC_DIALER}
      allow="microphone; autoplay; clipboard-read; clipboard-write; hid"
      onLoad={() => { if (state === "loading") set("signed-out"); post({ type: "is-logged-in" }); }}
    />
  );
});

export default JustCallDialer;
