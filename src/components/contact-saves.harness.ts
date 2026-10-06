// Test driver for contact-saves.test.ts. The app never imports this file.
//
// It runs the REAL component source (compiled by the TypeScript compiler from
// node_modules) against a small stand-in for React: hooks keep their slots
// across renders, effects run after each render with the previous cleanup
// first, and unmount runs every cleanup. A hook-free root wrapper is unwrapped
// once, honoring its child key before the new record renders. Other children are not rendered
// (the tree is plain {type, props} objects), and the clock, timers, fetch and
// window events are fakes the test controls. Nothing touches a network or a
// database. Same approach as Astra's round 7b probe, with unmount, held and
// failing requests, and a fake clock added.
import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "..", "..");

export type Req = { url: string; method: string; body: any };
export type Reply = { status: number; body?: any };
export type Node = { type: any; props: Record<string, any>; key?: string | null };

type Held = { req: Req; resolve: (r: Reply) => void; reject: (e: unknown) => void };

function named(name: string) {
  const C = () => null;
  Object.defineProperty(C, "name", { value: name });
  return C;
}

// Modules replaced for the test: React itself, and the child components a
// shallow render never draws anyway.
function stubFor(rel: string): any {
  switch (rel) {
    case "src/components/FieldRenderer.tsx": return { __esModule: true, default: named("FieldRenderer") };
    case "src/components/PhoneInput.tsx": return { __esModule: true, default: named("PhoneInput"), formatUsPhone: (v: string) => v, toE164: (v: string) => v };
    case "src/components/calls/JustCallDialer.tsx": return { __esModule: true, default: named("JustCallDialer"), popOutDialer: () => {} };
    case "src/lib/mva-call/engine.ts": return { __esModule: true, REBS: [], REB_GROUPS: [], LINES: {} };
    default: return null;
  }
}

export function createRuntime() {
  // ---- fake clock and timers
  let now = 0;
  let nextTimer = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const fakeSetTimeout = (fn: () => void, ms?: number) => { const id = ++nextTimer; timers.set(id, { at: now + (ms || 0), fn }); return id; };
  const fakeClearTimeout = (id: any) => { timers.delete(id); };

  // ---- fake fetch
  const requests: Req[] = [];
  const held: Held[] = [];
  let holding = false;
  let reply: (req: Req) => Reply = () => ({ status: 200, body: { ok: true } });
  const toResponse = (r: Reply) => ({ ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} });
  const fakeFetch = (url: string, init: any = {}) => {
    const req: Req = { url: String(url), method: String(init.method || "GET").toUpperCase(), body: init.body ? JSON.parse(init.body) : undefined };
    requests.push(req);
    // Loads (options, events, autofill map) answer empty at once.
    if (req.method === "GET") return Promise.resolve(toResponse({ status: 200, body: {} }));
    if (holding) return new Promise((resolve, reject) => held.push({ req, resolve: (r) => resolve(toResponse(r)), reject }));
    return Promise.resolve(toResponse(reply(req)));
  };

  // ---- fake window events
  const listeners = new Map<string, Set<(e: any) => void>>();
  const dispatched: { type: string; detail: any }[] = [];
  const fakeWindow = {
    addEventListener(type: string, fn: (e: any) => void) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(fn); },
    removeEventListener(type: string, fn: (e: any) => void) { listeners.get(type)?.delete(fn); },
    dispatchEvent(e: { type: string; detail: any }) { dispatched.push({ type: e.type, detail: e.detail }); for (const fn of Array.from(listeners.get(e.type) ?? [])) fn(e); return true; },
  };
  class FakeCustomEvent { type: string; detail: any; constructor(type: string, init?: { detail?: any }) { this.type = type; this.detail = init?.detail; } }

  // ---- React stand-in (one mounted component per runtime)
  let slots: any[] = [];
  let cursor = 0;
  let dirty = false;
  let queued: { i: number; fn: () => any }[] = [];
  const depsChanged = (a: any[] | undefined, b: any[] | undefined) => !a || !b || a.length !== b.length || a.some((v, n) => !Object.is(v, b[n]));
  const react: any = {
    useState(init: any) {
      const i = cursor++;
      if (!(i in slots)) {
        const slot: any = { kind: "state", v: typeof init === "function" ? init() : init };
        slot.set = (n: any) => { const v = typeof n === "function" ? n(slot.v) : n; if (!Object.is(v, slot.v)) { slot.v = v; dirty = true; } };
        slots[i] = slot;
      }
      return [slots[i].v, slots[i].set];
    },
    useRef(v: any) { const i = cursor++; if (!(i in slots)) slots[i] = { current: v }; return slots[i]; },
    useMemo(fn: () => any, deps?: any[]) { const i = cursor++; const old = slots[i]; if (!old || depsChanged(deps, old.deps)) slots[i] = { kind: "memo", deps, value: fn() }; return slots[i].value; },
    useCallback(fn: any, deps?: any[]) { return react.useMemo(() => fn, deps); },
    useEffect(fn: () => any, deps?: any[]) {
      const i = cursor++;
      const old = slots[i];
      if (!old || depsChanged(deps, old.deps)) { slots[i] = { kind: "effect", deps, cleanup: old?.cleanup }; queued.push({ i, fn }); }
    },
  };
  react.useLayoutEffect = react.useEffect;
  const jsxRuntime = {
    jsx: (type: any, props: any, key?: string) => ({ type, props: props ?? {}, key: key ?? null }),
    jsxs: (type: any, props: any, key?: string) => ({ type, props: props ?? {}, key: key ?? null }),
    Fragment: "Fragment",
  };

  // ---- module loader for the real source
  const cache = new Map<string, any>();
  function resolve(spec: string, fromAbs: string): string {
    const base = spec.startsWith("@/") ? path.join(ROOT, "src", spec.slice(2)) : path.resolve(path.dirname(fromAbs), spec);
    for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const p = base + ext;
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    }
    throw new Error(`cannot resolve ${spec} from ${fromAbs}`);
  }
  function load(rel: string, expose: string[] = []): any {
    if (rel.endsWith('.css')) return {};
    const abs = path.join(ROOT, rel);
    const key = abs + "|" + expose.join(",");
    if (cache.has(key)) return cache.get(key);
    const stub = stubFor(rel);
    if (stub) { cache.set(key, stub); return stub; }
    let src = fs.readFileSync(abs, "utf8");
    // Test-only: reach a file-private component (ContactCard) without
    // changing what the app's module exports.
    if (expose.length) src += `\nexport { ${expose.map((n) => `${n} as __${n}`).join(", ")} };\n`;
    const js = ts.transpileModule(src, {
      fileName: abs,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const mod: any = { exports: {} };
    cache.set(key, mod.exports);
    const req = (spec: string) => {
      if (spec === "react") return react;
      if (spec === "react/jsx-runtime") return jsxRuntime;
      if (spec === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {}, replace() {} }) };
      return load(path.relative(ROOT, resolve(spec, abs)).split(path.sep).join("/"));
    };
    const run = new Function("exports", "require", "module", "__filename", "__dirname", "setTimeout", "clearTimeout", "fetch", "window", "CustomEvent", "confirm", js);
    run(mod.exports, req, mod, abs, path.dirname(abs), fakeSetTimeout, fakeClearTimeout, fakeFetch, fakeWindow, FakeCustomEvent, () => true);
    cache.set(key, mod.exports);
    return mod.exports;
  }

  // ---- mounting
  let view: View | null = null;
  function mount(Component: (p: any) => any, props: any): View {
    if (view) throw new Error("one component per runtime");
    let current = props;
    let tree: any = null;
    let mounted = true;
    let child: { type: any; key: any } | null = null;
    const cleanup = () => {
      for (const s of slots) if (s && s.kind === "effect" && typeof s.cleanup === "function") { const c = s.cleanup; s.cleanup = undefined; c(); }
    };
    const render = () => {
      if (!mounted) return tree;
      for (let n = 0; n < 50; n++) {
        cursor = 0; dirty = false;
        tree = Component(current);
        // ContactInfo/CaseDetails now wrap their stateful record in a key.
        // Execute only this root boundary, not arbitrary shallow children.
        if (cursor === 0 && typeof tree?.type === "function") {
          if (child && (child.type !== tree.type || child.key !== tree.key)) {
            cleanup(); slots = []; queued = [];
          }
          child = { type: tree.type, key: tree.key };
          tree = tree.type(tree.props);
        }
        const effects = queued; queued = [];
        for (const e of effects) { const c = slots[e.i].cleanup; slots[e.i].cleanup = undefined; if (typeof c === "function") c(); }
        for (const e of effects) { const r = e.fn(); slots[e.i].cleanup = typeof r === "function" ? r : undefined; }
        if (!dirty) return tree;
      }
      throw new Error("render did not settle");
    };
    render();
    view = {
      get tree() { return tree; },
      rerender(next?: any) { if (next !== undefined) current = next; return render(); },
      act(fn: () => void) { fn(); return render(); },
      unmount() {
        mounted = false;
        cleanup();
      },
    };
    return view;
  }

  async function settle() {
    for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
    view?.rerender();
  }

  return {
    load,
    mount,
    requests,
    dispatched,
    /** POSTs so far, in order. */
    posts: () => requests.filter((r) => r.method === "POST"),
    /** Timers waiting to fire. */
    pendingTimers: () => timers.size,
    /** Moves the fake clock forward, firing due timers in order. */
    async advance(ms: number) {
      const until = now + ms;
      for (;;) {
        let next: [number, { at: number; fn: () => void }] | null = null;
        for (const e of Array.from(timers.entries())) if (e[1].at <= until && (!next || e[1].at < next[1].at)) next = e;
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
        await settle();
      }
      now = until;
      await settle();
    },
    settle,
    /** Replies to POSTs at once with this. */
    replyWith(fn: (req: Req) => Reply) { reply = fn; },
    /** POSTs stay open until released. */
    hold(on = true) { holding = on; },
    held: () => held.length,
    async release(r: Reply = { status: 200, body: { ok: true } }) {
      const h = held.shift();
      if (!h) throw new Error("no request is being held");
      h.resolve(r);
      await settle();
    },
    async dropConnection() {
      const h = held.shift();
      if (!h) throw new Error("no request is being held");
      h.reject(new TypeError("Failed to fetch"));
      await settle();
    },
    /** A window event from elsewhere on the page (the call console). */
    dispatch(type: string, detail: any) { fakeWindow.dispatchEvent({ type, detail }); view?.rerender(); },
  };
}

export interface View {
  readonly tree: any;
  rerender(next?: any): any;
  act(fn: () => void): any;
  unmount(): void;
}

// ---- tree helpers
export function walk(node: any, pred: (n: Node) => boolean, out: Node[] = []): Node[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { for (const x of node) walk(x, pred, out); return out; }
  if ("type" in node && "props" in node) {
    if (pred(node as Node)) out.push(node as Node);
    walk(node.props?.children, pred, out);
  }
  return out;
}

export function one(tree: any, pred: (n: Node) => boolean, what: string): Node {
  const found = walk(tree, pred);
  if (found.length !== 1) throw new Error(`expected one ${what}, found ${found.length}`);
  return found[0];
}

/** All text in the tree, joined, for "does the screen say X" checks. */
export function text(tree: any): string {
  const out: string[] = [];
  const go = (n: any) => {
    if (n == null || typeof n === "boolean") return;
    if (typeof n === "string" || typeof n === "number") { out.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(go); return; }
    if (typeof n === "object" && "props" in n) go(n.props?.children);
  };
  go(tree);
  return out.join(" ");
}

/** The first control inside a `.field` whose label reads `label` (the CRM's layout). */
export function fieldControl(tree: any, label: string): Node {
  const fields = walk(tree, (n) => n.props?.className === "field" && walk(n.props.children, (c) => c.type === "label" && text(c) === label).length > 0);
  if (fields.length !== 1) throw new Error(`expected one field labelled ${label}, found ${fields.length}`);
  const ctl = walk(fields[0].props.children, (c) => c.type === "input" || c.type === "select" || c.type === "textarea" || typeof c.type === "function");
  if (!ctl.length) throw new Error(`no control in field ${label}`);
  return ctl[0];
}
