"use client";
import { useEffect } from "react";

// Shows the lead-number address (claimreach.com/app/TMP-1042) in the bar when
// the page was opened by its long internal ID. Nothing reloads.
export default function CanonicalUrl({ path }: { path: string }) {
  useEffect(() => {
    try {
      if (path && window.location.pathname !== path) {
        window.history.replaceState(window.history.state, "", path + window.location.search + window.location.hash);
      }
    } catch { /* the old address still works */ }
  }, [path]);
  return null;
}
