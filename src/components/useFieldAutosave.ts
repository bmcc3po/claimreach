// One autosave for a screen of record fields: the CRM's Contact Info and Case
// Details tabs and the call console's contact card (Astra round 7b, #6).
//
// Every edit gives that field a new revision number. The debounced save sends
// ONLY the fields edited since they were last saved, with the values they hold
// when the request goes out (never a copy taken when the timer was set). A
// save that lands clears only the revisions it carried, so a field typed into
// while the request was out stays unsaved and goes on the next save. A failed
// save keeps every field unsaved and shows why. It never says Saved.
//
// `incoming` is for values that arrive from somewhere else (a refreshed
// record, a save made on another screen). They fill clean fields only: they
// never replace typing that has not saved yet, never cancel the pending save,
// and never count as an edit. Leaving the screen sends what is pending instead
// of dropping it.
import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface AutosaveOptions<V> {
  /** Milliseconds after the last edit before the save goes out. */
  delay: number;
  /** Writes these fields. Throw an Error whose message the screen can show. */
  send: (patch: Partial<V>) => Promise<void>;
  /** Called after a save lands, with exactly the fields and values it wrote. */
  onSaved?: (patch: Partial<V>) => void;
}

type Setters<V> = {
  setValues: (v: V) => void;
  setPending: (n: number) => void;
  setSaving: (b: boolean) => void;
  setError: (s: string) => void;
  setSavedAt: (n: number) => void;
};

function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a && b && typeof a === "object" && typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

// The bookkeeping lives outside React state so a timer, an event listener or
// an unmount always reads the current values, never a render's old copy.
function makeAutosave<V extends Record<string, any>>(start: V, opts: { current: AutosaveOptions<V> }, s: Setters<V>) {
  let values = start;
  const revs: Record<string, number> = {};
  let counter = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let busy = false;
  let again = false;

  const dirtyCount = () => Object.keys(revs).length;
  const setAll = (next: V) => { values = next; s.setValues(next); };

  async function run(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null; }
    // One request at a time. Whatever is edited meanwhile goes next.
    if (busy) { again = true; return; }
    const taken: Record<string, number> = { ...revs };
    const keys = Object.keys(taken);
    if (!keys.length) return;
    const patch: Record<string, any> = {};
    for (const k of keys) patch[k] = values[k];
    busy = true;
    s.setSaving(true);
    s.setError("");
    let ok = false;
    try {
      await opts.current.send(patch as Partial<V>);
      ok = true;
    } catch (e: any) {
      // Nothing is acknowledged: every field stays unsaved and the screen says why.
      s.setError(String(e?.message || "") || "Could not save. Nothing was written.");
    }
    busy = false;
    s.setSaving(false);
    try {
      if (ok) {
        // Only the revisions this request carried. A field edited again while
        // it was out keeps its newer revision and stays unsaved.
        for (const k of keys) if (revs[k] === taken[k]) delete revs[k];
        s.setPending(dirtyCount());
        s.setSavedAt(Date.now());
        opts.current.onSaved?.(patch as Partial<V>);
      }
    } finally {
      if (again) {
        again = false;
        if (dirtyCount() && !timer) void run();
      }
    }
  }

  return {
    /** A person changed these fields. `now` saves at once instead of after the delay. */
    edit(patch: Partial<V>, now = false) {
      const keys = Object.keys(patch);
      if (!keys.length) return;
      for (const k of keys) revs[k] = ++counter;
      setAll({ ...values, ...patch });
      s.setPending(dirtyCount());
      if (timer) { clearTimeout(timer); timer = null; }
      if (now) { void run(); return; }
      timer = setTimeout(() => { timer = null; void run(); }, opts.current.delay);
    },
    /** Values from elsewhere: applied to clean fields only, never an edit. */
    incoming(patch: Partial<V>) {
      let next: V | null = null;
      for (const k of Object.keys(patch)) {
        if (k in revs) continue;
        const v = (patch as any)[k];
        if (same(values[k], v)) continue;
        if (!next) next = { ...values };
        (next as any)[k] = v;
      }
      if (next) setAll(next);
    },
    /** Send pending edits now (leaving the screen). */
    flush() {
      if (timer || dirtyCount()) void run();
    },
    /** A signing action must see the acknowledged contact, not pending typing. */
    async flushAndWait(): Promise<boolean> {
      for (let i = 0; i < 100; i++) {
        if (busy) { await new Promise((resolve) => setTimeout(resolve, 50)); continue; }
        await run();
        return !busy && dirtyCount() === 0;
      }
      return false;
    },
    isDirty(k: string) { return k in revs; },
  };
}

export function useFieldAutosave<V extends Record<string, any>>(initial: () => V, options: AutosaveOptions<V>) {
  const [values, setValues] = useState<V>(initial);
  const [pending, setPending] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const opts = useRef(options);
  opts.current = options;
  const api = useRef<ReturnType<typeof makeAutosave<V>> | null>(null);
  if (!api.current) api.current = makeAutosave<V>(values, opts, { setValues, setPending, setSaving, setError, setSavedAt });
  // Switching tabs or leaving the call sends what is pending instead of dropping it.
  useEffect(() => () => { api.current?.flush(); }, []);
  const status: AutosaveStatus = error ? "error" : saving ? "saving" : pending ? "dirty" : savedAt != null ? "saved" : "idle";
  const a = api.current;
  return { values, status, error, savedAt, edit: a.edit, incoming: a.incoming, flush: a.flush, flushAndWait: a.flushAndWait, isDirty: a.isDirty };
}
