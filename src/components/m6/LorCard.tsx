"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LOR_STATUSES, LOR_SENT_TO, lorShowsOnToday } from "@/lib/m6";
import LorSend from "./LorSend";

export default function LorCard({ leadId, lor }: { leadId: string; lor: any }) {
  const router = useRouter();
  const [lorStatus, setLorStatus] = useState(lor?.status ?? "not_sent");
  const [lorToday, setLorToday] = useState(!!lorShowsOnToday(lor));
  const [lorSentOn, setLorSentOn] = useState(lor?.sent_on ?? "");
  const [lorSentTo, setLorSentTo] = useState(lor?.sent_to ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);

  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setErr(""); setSaved(false);
    try {
      const r = await fetch("/api/m6/lor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          status: lorStatus,
          flagged_today: lorToday,
          sent_on: lorSentOn || null,
          sent_to: lorSentTo || null,
        }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || d?.error || d?.ok !== true) { setErr(d?.error || "Could not confirm the save. Your changes are still here. Reload the file to check its saved status before trying again."); return; }
      setSaved(true);
      router.refresh();
    } catch {
      setErr("Could not confirm the save. Your changes are still here. Reload the file to check its saved status before trying again.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <section className="m6-card m6-lor">
      <h2>Letter of representation</h2>
      {err && <p className="m6-error" role="alert">{err}</p>}
      {saved && <p className="m6-ok" role="status">Status saved.</p>}
      <div className="m6-lor-grid">
        <label className="m6-field">
          <span>Status</span>
          <select
            disabled={busy}
            value={lorStatus}
            onChange={(e) => {
              const v = e.target.value;
              setSaved(false);
              setLorStatus(v);
              if (v === "ready") setLorToday(true);
              if (v === "sent" || v === "received") setLorToday(false);
            }}
          >
            {LOR_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="m6-field">
          <span>Sent on</span>
          <input type="date" disabled={busy} value={lorSentOn} onChange={(e) => { setLorSentOn(e.target.value); setSaved(false); }} />
        </label>
        <label className="m6-field">
          <span>Sent to</span>
          <select disabled={busy} value={lorSentTo} onChange={(e) => { setLorSentTo(e.target.value); setSaved(false); }}>
            <option value="">Not yet</option>
            {LOR_SENT_TO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>
      <label className="m6-check">
        <input
          type="checkbox"
          checked={lorToday}
          disabled={busy || lorStatus === "sent" || lorStatus === "received"}
          onChange={(e) => { setLorToday(e.target.checked); setSaved(false); }}
        />
        Show on Today
      </label>
      <div className="m6-health-acts">
        <button type="button" className="m6-btn primary" disabled={busy} onClick={() => setSendOpen(true)}>
          Send LOR
        </button>
        <button type="button" className="m6-btn" disabled={busy} onClick={save}>
          {busy ? "Saving" : "Save status"}
        </button>
      </div>
      {sendOpen && (
        <LorSend
          leadId={leadId}
          onClose={() => setSendOpen(false)}
          onSent={() => { setSendOpen(false); router.refresh(); }}
        />
      )}
    </section>
  );
}
