"use client";
import { useEffect, useState } from "react";

export default function QuoteBanner() {
  const [q, setQ] = useState<{ q: string; a: string } | null>(null);
  useEffect(() => {
    fetch("/api/quote").then((r) => r.json()).then(setQ).catch(() => {});
  }, []);
  if (!q) return null;
  return (
    <div className="quote">
      <div className="qt">&ldquo;{q.q}&rdquo;</div>
      <div className="qa">— {q.a}</div>
    </div>
  );
}
