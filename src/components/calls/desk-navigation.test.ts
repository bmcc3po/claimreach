import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import * as links from "../../lib/mva-call/links";
import * as deskTypes from "../../lib/mva-call/desk-types";
import { pilotStaffPageAllowed } from "../../lib/inno-pilot-access";

type Instance = { hooks: any[]; next: number; effects: (() => void)[] };
let active: Instance;
const React: any = {
  createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
  useState(initial: any) {
    const owner = active, index = owner.next++;
    if (!(index in owner.hooks)) owner.hooks[index] = typeof initial === "function" ? initial() : initial;
    return [owner.hooks[index], (value: any) => { owner.hooks[index] = typeof value === "function" ? value(owner.hooks[index]) : value; }];
  },
  useRef(initial: any) { return React.useState({ current: initial })[0]; },
  useEffect(fn: () => void) { active.effects.push(fn); },
  useMemo(fn: () => any) { return fn(); },
};
const render = (instance: Instance, component: any, props: any) => { active = instance; instance.next = 0; instance.effects = []; return component(props); };
const fresh = (): Instance => ({ hooks: [], next: 0, effects: [] });
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree?.props ? [tree, ...nodes(tree.props.children)] : [];
}
const text = (tree: any): string => Array.isArray(tree) ? tree.map(text).join("") : tree?.props ? text(tree.props.children) : String(tree ?? "");
const events = new EventTarget();
const fakeWindow = { location: { pathname: "/app/TMP-SYNTH", search: "?claim=exact-claim&text=1" }, dispatchEvent: events.dispatchEvent.bind(events), addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), history: { replaceState() {} } };
const modules: Record<string, any> = {
  react: React, "@/components/ui/Icon": { default: () => null },
  "@/components/SignOut": { default: function SignOut() { return null; } },
  "@/lib/mva-call/links": links, "@/lib/mva-call/desk-types": deskTypes,
  "next/navigation": { useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => fakeWindow.location.pathname },
  "@/lib/supabase-browser": { supabaseBrowser: () => { throw new Error("Unexpected database access"); } },
};
function load(file: string) {
  const source = fs.readFileSync(path.join(__dirname, file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const exports: any = {};
  new Function("require", "exports", "React", "window", code)((name: string) => { assert.ok(name in modules, name); return modules[name]; }, exports, React, fakeWindow);
  return exports.default;
}
const Chrome = load("DeskChrome.tsx");
for (const role of ["agent", "qa", "manager", "admin", "owner"]) {
  const instance = fresh(), props = { name: "Synthetic Operator", role };
  const tree = render(instance, Chrome, props);
  const hrefs = nodes(tree).filter(n => n.type === "a").map(n => n.props.href);
  if (role === "owner") assert.ok(hrefs.includes("/leads") && hrefs.includes("/signed") && hrefs.includes("/profile"));
  else {
    for (const href of hrefs) assert.ok(pilotStaffPageAllowed(new URL(href, "https://example.invalid").pathname), `${role}: ${href}`);
    assert.ok(hrefs.includes("/app?tab=signed")); assert.ok(hrefs.includes("/app?tab=due"));
    assert.equal(hrefs.includes("/profile"), false);
    assert.ok(nodes(tree).some(n => n.type?.name === "SignOut"), "staff retain the existing account sign-out action");
  }
  const linkNode = nodes(tree).find(n => n.type?.name === "FullSiteLink")!;
  const linkInstance = fresh(); render(linkInstance, linkNode.type, linkNode.props);
  for (const effect of linkInstance.effects) effect();
  const link = render(linkInstance, linkNode.type, linkNode.props);
  if (role === "owner") assert.equal(link.props.href, "/leads/TMP-SYNTH?claim=exact-claim");
  else {
    assert.equal(link.type, "button"); assert.equal(text(link), "Review case");
    let opened = false;
    const onOpen = () => { opened = true; };
    events.addEventListener(links.OPEN_DESK_FILE_EVENT, onOpen);
    link.props.onClick(); assert.equal(opened, true);
    events.removeEventListener(links.OPEN_DESK_FILE_EVENT, onOpen);
    assert.equal(fakeWindow.location.search, "?claim=exact-claim&text=1", "review doesn't navigate or replace the pinned matter");
  }
}
console.log("ok actual Desk navigation keeps every staff role on allowed routes; owner routes and claim context remain intact");

// Exercise the real queue-arrival effect; a signed link cannot silently open
// the default callback/new queue. Unknown tab values keep the safe default.
const Home = load("CallsHome.tsx");
const data = { me: { name: "Synthetic", role: "agent" }, campaigns: [], queues: { due: [], wait: [], callbacks: [], sent: [], signed: [], wip: [], review: [] }, texts: [], setup: [], notes: [] };
for (const tab of [...deskTypes.DESK_TABS.map(([key]) => key), "outside"]) {
  fakeWindow.location.search = `?tab=${tab}`;
  const instance = fresh(); render(instance, Home, { data });
  // This is the component's existing URL arrival effect, not a reimplementation.
  const arrival = instance.effects.find(fn => fn.toString().includes("requestedTab")); assert.ok(arrival); arrival();
  const tree = render(instance, Home, { data });
  const selected = nodes(tree).find(n => n.type === "button" && n.props["aria-current"] === "page")!;
  assert.equal(text(selected), deskTypes.DESK_TABS.find(([key]) => key === tab)?.[1] || "WAIT TO CALL");
}
console.log("ok actual queue arrival selects all seven requested queues and rejects unsupported tab values");

// The top review button's actual CallConsole effect only reveals existing UI.
const consoleSource = fs.readFileSync(path.join(__dirname, "CallConsole.tsx"), "utf8");
const marker = consoleSource.indexOf("window.addEventListener(OPEN_DESK_FILE_EVENT");
const start = consoleSource.lastIndexOf("useEffect(() => {", marker), end = consoleSource.indexOf("}, []);", marker) + 7;
assert.ok(start > 0 && end > start);
let selectedTab = "texts", utility = false, handler: (() => void) | undefined, removed = false;
new Function("useEffect", "window", "OPEN_DESK_FILE_EVENT", "setDeskTab", "setUtilityOpen", consoleSource.slice(start, end))(
  (effect: () => () => void) => { const cleanup = effect(); handler?.(); cleanup(); },
  { addEventListener: (name: string, fn: () => void) => { assert.equal(name, links.OPEN_DESK_FILE_EVENT); handler = fn; }, removeEventListener: () => { removed = true; } },
  links.OPEN_DESK_FILE_EVENT, (tab: string) => { selectedTab = tab; }, (open: boolean) => { utility = open; });
assert.equal(selectedTab, "file"); assert.equal(utility, true); assert.equal(removed, true);
assert.equal(links.caseFileHref("agent", "TMP test", "claim/sibling"), "/app/TMP%20test?claim=claim%2Fsibling&review=1");
assert.equal(links.caseFileHref("owner", "TMP test", "claim/sibling"), "/leads/TMP%20test?claim=claim%2Fsibling");
console.log("ok actual review handler opens the current File panel without save, send, signing or navigation side effects");
