"use client";
import { useState } from "react";
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

  async function save(body: any) {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/m6/touch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, ...body }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) { setErr(d.error || "That did not save. Try again."); return; }
      setOpen(false);
      router.refresh();
    } catch {
      setErr("That did not save. Check your connection and try again.");
    } finally {
      setBusy(false);
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
          onClose={() => setOpen(false)}
          points={points}
          onSave={save}
          busy={busy}
        />
      )}
    </>
  );
}
