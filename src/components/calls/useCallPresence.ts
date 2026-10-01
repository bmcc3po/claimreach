"use client";
import { useEffect, useState } from "react";

export interface LiveCall { state: "starting" | "ringing" | "connected"; agent: string }

export function useCallPresence(ids: string[]) {
  const key = [...new Set(ids.filter(Boolean))].slice(0, 100).sort().join(",");
  const [presence, setPresence] = useState<Record<string, LiveCall>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    if (!key) { setPresence({}); return; }
    let alive = true;
    const check = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(`/api/calls/presence?ids=${encodeURIComponent(key)}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok || result.error) throw new Error(result.error || "Could not check calls.");
        if (alive) { setPresence(result.presence || {}); setError(""); }
      } catch { if (alive) setError("Live call status unavailable. Check before dialing."); }
    };
    void check();
    const timer = setInterval(() => void check(), 5000);
    document.addEventListener("visibilitychange", check);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [key]);
  return { presence, error };
}

export async function reserveClientCall(leadId: string, phone: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/calls/presence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead_id: leadId, phone }) });
  } catch { throw new Error("Could not check whether another agent is calling. Please wait before dialing."); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.reserved) throw new Error(result.error || "Could not confirm the client is free to call.");
}
