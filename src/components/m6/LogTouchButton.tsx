"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogTouch, type TouchPoint } from "./M6Modals";

export default function LogTouchButton({
  leadId, points,
}: {
  leadId: string;
  points: TouchPoint[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inFlight = useRef(false);

  async function save(body: any) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/m6/touch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, ...body }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || d?.error || d?.ok !== true) { setErr(d?.error || "Could not confirm the save. Your note is still here. Check the timeline before trying again."); return; }
      setOpen(false);
      router.refresh();
    } catch {
      setErr("Could not confirm the save. Your note is still here. Check the timeline before trying again.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <>
      <button type="button" className="btn ghost sm" onClick={() => { setErr(""); setOpen(true); }}>
        Log a touch
      </button>
      {open && (
        <LogTouch
          err={err}
          onClose={() => { if (!inFlight.current) setOpen(false); }}
          points={points}
          onSave={save}
          busy={busy}
        />
      )}
    </>
  );
}
