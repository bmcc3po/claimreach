"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// The LawRuler text got here before the lead did. Check every few seconds for
// about a minute and a half, then offer a way forward.
export default function LrWait({ id }: { id: string }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const [gone, setGone] = useState(false);
  const valid = /^[\w.-]{1,64}$/.test(id);

  useEffect(() => {
    if (!valid || gone) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/calls/lr?id=${encodeURIComponent(id)}`);
        const d = await r.json();
        if (!alive) return;
        if (d?.lead_id) { router.replace(`/app/${d.lead_id}`); return; }
      } catch { /* try again on the next tick */ }
      if (tries >= 35) setGone(true); else setTries((n) => n + 1);
    }, 2500);
    return () => { alive = false; clearTimeout(t); };
  }, [tries, gone, id, valid, router]);

  return (
    <div className="cc-app">
      <div className="cc-wait">
        {!valid ? (
          <>
            <div className="cc-wait-t">That link is missing the lead number.</div>
            <a className="cc-wait-b" href="/app">Go to the App</a>
          </>
        ) : !gone ? (
          <>
            <div className="cc-spin" aria-hidden="true" />
            <div className="cc-wait-t">Getting lead {id} from LawRuler</div>
            <div className="cc-wait-s">It opens by itself as soon as it lands.</div>
          </>
        ) : (
          <>
            <div className="cc-wait-t">Lead {id} is not here yet</div>
            <div className="cc-wait-s">LawRuler has not sent it over. Try again, or start the call and it will match up when it arrives.</div>
            <button className="cc-wait-b" onClick={() => { setGone(false); setTries(0); }}>Try again</button>
            <a className="cc-wait-b cc-wait-ghost" href="/app?new=1">Start the call by hand</a>
          </>
        )}
      </div>
    </div>
  );
}
