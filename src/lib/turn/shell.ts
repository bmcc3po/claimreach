// ClaimTurn shell vs bolt-ons. Defined once. The file is the presentation.

export const SHELL_MARK = "ClaimTurn · shell";
export const BOLTON_MARK = "bolt-on";

export const SHELL_ROWS = [
  { key: "matter", label: "Matter", detail: "client, DOI, venue, SOL, stage" },
  { key: "people", label: "People", detail: "client, adjuster, staff, insured" },
  { key: "providers", label: "Providers", detail: "treatment plan, last visit, next appt, MMI" },
  { key: "carriers", label: "Carriers", detail: "coverage, claim #, limits, LOR" },
  { key: "liens", label: "Liens", detail: "holders on this file" },
  { key: "documents", label: "Documents", detail: "pointers. Not a vendor vault." },
  { key: "send_log", label: "Send log", detail: "what left the building" },
  { key: "tasks", label: "Tasks", detail: "ticklers, KEEP ladder, marching orders" },
  { key: "acl", label: "Who sees this file", detail: "named people, this firm" },
  { key: "concierge", label: "Concierge + ingest", detail: "brief and extract over these rows" },
] as const;

export type ShellRowKey = (typeof SHELL_ROWS)[number]["key"];

export type BoltonKey = "postgrid" | "justcall" | "dropbox_sign" | "haiku" | "chartswap" | "eve";

export const BOLTONS: {
  key: BoltonKey;
  label: string;
  job: string;
  writes: string;
  onFile: boolean;
  gray: string | null;
}[] = [
  {
    key: "postgrid",
    label: "PostGrid",
    job: "NOTICE / LOR / records letters (paper)",
    writes: "send log",
    onFile: true,
    gray: null,
  },
  {
    key: "justcall",
    label: "JustCall",
    job: "voice / SMS. Drafts live here. Send is a tap.",
    writes: "send log + why-you're-here",
    onFile: true,
    gray: null,
  },
  {
    key: "dropbox_sign",
    label: "Dropbox Sign",
    job: "e-sign. Envelope status writes back.",
    writes: "document pointers",
    onFile: false,
    gray: "no envelope on this file",
  },
  {
    key: "haiku",
    label: "Claude (Haiku)",
    job: "classify dump + extract to rows. Not Eve. Not a chatbot.",
    writes: "rows + file note",
    onFile: true,
    gray: null,
  },
  {
    key: "chartswap",
    label: "ChartSwap",
    job: "hospital toll only. Not the records path.",
    writes: "document pointers if a facility forces the portal",
    onFile: false,
    gray: "not on this file · do not open unless a hospital forces it",
  },
  {
    key: "eve",
    label: "Eve",
    job: "sidecar per file if ever. Not the brain.",
    writes: "nothing on Ortiz",
    onFile: false,
    gray: "not on this file",
  },
];

export const BOLTON_BUTTON = {
  postgrid: `${BOLTON_MARK} · PostGrid`,
  justcall: `${BOLTON_MARK} · JustCall`,
  haiku: `${BOLTON_MARK} · Claude (Haiku)`,
} as const;

export const SHELL_LINE = "ClaimTurn is the file. Bolt-ons do one job and come home. Filevine / Neos / Alpha Law are not the brain.";

export function boltonByKey(key: BoltonKey) {
  const hit = BOLTONS.find((b) => b.key === key);
  if (!hit) throw new Error("unknown bolt-on");
  return hit;
}

export function isShellRow(key: string): key is ShellRowKey {
  return SHELL_ROWS.some((r) => r.key === key);
}

export function chartswapIsRecordsPath(): false {
  return false;
}
