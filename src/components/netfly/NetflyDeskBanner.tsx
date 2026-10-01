"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "./netfly.css";

type Row = { id: string; lead_no: string; claimant_name: string; missing_source: string[];
  live_call: { by_name: string } | null; claims?: { answers?: any }[] };

export default function NetflyDeskBanner() {
  const [files, setFiles] = useState<Row[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    async function refresh() {
      try {
        const response = await fetch("/api/netfly", { cache: "no-store" });
        if (!response.ok) throw new Error("NETFLY queue unavailable");
        const body = await response.json();
        if (live) { setFiles(body.files || []); setError(false); }
      } catch { if (live) setError(true); }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => { live = false; window.clearInterval(timer); };
  }, []);
  const newFiles = files.filter(file => !file.claims?.[0]?.answers?.netfly_secondary?.call_close);
  return <section className="nf-desk-banner" aria-label="NETFLY signed transfers">
    <div className="nf-desk-banner-head"><Link href="/app/netfly">NETFLY ONTAKE <strong>{error ? "Check queue" : `${newFiles.length} new`}</strong> →</Link>
      <span>Signed transfers awaiting a welcome call</span></div>
    {error && <p role="alert">NETFLY queue could not refresh. Open it to check for new files.</p>}
    {!error && newFiles.length > 0 && <div className="nf-desk-banner-list">{newFiles.slice(0, 4).map(file =>
      <Link key={file.id} href={`/app/netfly/${file.lead_no || file.id}`}><strong>{file.claimant_name}</strong>
        <span>{file.live_call ? `On phone · ${file.live_call.by_name}` : file.missing_source?.length ? "Partial · source items missing" : "Welcome call needed"}</span></Link>)}</div>}
  </section>;
}
