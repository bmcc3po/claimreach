// ============================================================================
// ClaimReach status model (single source of truth for the typed layer).
// The `statuses` DB table is authoritative for owner edits; this mirrors the
// seed so components have labels, tones, and flags without a round-trip, and
// provides helpers the pipeline relies on.
// ============================================================================

export type StatusTone = "good" | "bad" | "warn" | "info" | "neut";
export type StatusPhase = "pre_qa" | "in_qa" | "post_qa" | "terminal";
export type StatusQualify = "qualify" | "disqualify" | "undetermined";
export type StatusSide = "agent" | "qa" | "owner" | "firm" | "system";
export type StatusTrack = "esign" | "nosig" | "intake" | "firm" | "terminal" | "none";

export interface StatusDef {
  key: string;
  label: string;
  track: StatusTrack;
  phase: StatusPhase;
  tone: StatusTone;
  side: StatusSide;
  qualify: StatusQualify;
  requires_esign: boolean;
  billable: boolean;
  unlocks_firm: boolean;
  is_final: boolean;
  lawruler_group?: string;
  sort: number;
  active?: boolean;
  system_locked?: boolean;
}

// Default seed mirror. Keep in lockstep with migration 0030.
export const DEFAULT_STATUSES: StatusDef[] = [
  { key: "new",             label: "New",                 track: "intake",   phase: "pre_qa",   tone: "neut", side: "agent",  qualify: "undetermined", requires_esign: false, billable: false, unlocks_firm: false, is_final: false, lawruler_group: "New/Open",       sort: 10,  system_locked: true },
  { key: "contacting",      label: "Contacting",          track: "intake",   phase: "pre_qa",   tone: "info", side: "agent",  qualify: "undetermined", requires_esign: false, billable: false, unlocks_firm: false, is_final: false, lawruler_group: "New/Open",       sort: 20,  system_locked: true },
  { key: "esign_sent",      label: "e-Sign Sent",         track: "esign",    phase: "pre_qa",   tone: "warn", side: "agent",  qualify: "undetermined", requires_esign: true,  billable: false, unlocks_firm: false, is_final: false, lawruler_group: "Wanted/Chasing", sort: 30,  system_locked: true },
  { key: "signed_grievous", label: "Signed: Grievous",    track: "esign",    phase: "in_qa",    tone: "warn", side: "system", qualify: "undetermined", requires_esign: true,  billable: false, unlocks_firm: false, is_final: false, lawruler_group: "Wanted/Chasing", sort: 40,  system_locked: true },
  { key: "signed_qa",       label: "Signed: QA",          track: "esign",    phase: "in_qa",    tone: "warn", side: "qa",     qualify: "undetermined", requires_esign: true,  billable: false, unlocks_firm: false, is_final: false, lawruler_group: "Wanted/Chasing", sort: 50,  system_locked: true },
  { key: "signed_wip",      label: "Signed: WIP",         track: "esign",    phase: "in_qa",    tone: "warn", side: "agent",  qualify: "undetermined", requires_esign: true,  billable: false, unlocks_firm: false, is_final: false, lawruler_group: "Wanted/Chasing", sort: 60,  system_locked: true },
  { key: "signed_flag",     label: "Signed: Flag BMC",    track: "esign",    phase: "in_qa",    tone: "bad",  side: "owner",  qualify: "undetermined", requires_esign: true,  billable: false, unlocks_firm: false, is_final: false, lawruler_group: "Wanted/Chasing", sort: 70,  system_locked: true },
  { key: "signed_approved", label: "Signed: Approved",    track: "esign",    phase: "post_qa",  tone: "good", side: "firm",   qualify: "qualify",      requires_esign: true,  billable: true,  unlocks_firm: true,  is_final: false, lawruler_group: "Clients",        sort: 80,  system_locked: true },
  { key: "signed_dropped",  label: "Signed: Drop Letter", track: "esign",    phase: "terminal", tone: "bad",  side: "firm",   qualify: "disqualify",   requires_esign: true,  billable: true,  unlocks_firm: false, is_final: true,  lawruler_group: "Rejected",       sort: 90,  system_locked: true },
  { key: "grievous",        label: "Grievous",            track: "nosig",    phase: "in_qa",    tone: "warn", side: "system", qualify: "undetermined", requires_esign: false, billable: false, unlocks_firm: false, is_final: false, lawruler_group: "Wanted/Chasing", sort: 100, system_locked: true },
  { key: "qa",              label: "QA",                  track: "nosig",    phase: "in_qa",    tone: "warn", side: "qa",     qualify: "undetermined", requires_esign: false, billable: false, unlocks_firm: false, is_final: false, lawruler_group: "Wanted/Chasing", sort: 110, system_locked: true },
  { key: "wip",             label: "WIP",                 track: "nosig",    phase: "in_qa",    tone: "warn", side: "agent",  qualify: "undetermined", requires_esign: false, billable: false, unlocks_firm: false, is_final: false, lawruler_group: "Wanted/Chasing", sort: 120, system_locked: true },
  { key: "flag",            label: "Flag BMC",            track: "nosig",    phase: "in_qa",    tone: "bad",  side: "owner",  qualify: "undetermined", requires_esign: false, billable: false, unlocks_firm: false, is_final: false, lawruler_group: "Wanted/Chasing", sort: 130, system_locked: true },
  { key: "approved",        label: "Approved",            track: "nosig",    phase: "post_qa",  tone: "good", side: "firm",   qualify: "qualify",      requires_esign: false, billable: true,  unlocks_firm: true,  is_final: false, lawruler_group: "Clients",        sort: 140, system_locked: true },
  { key: "dq_billable",     label: "DQ Billable",         track: "nosig",    phase: "terminal", tone: "bad",  side: "firm",   qualify: "disqualify",   requires_esign: false, billable: true,  unlocks_firm: false, is_final: true,  lawruler_group: "Rejected",       sort: 150, system_locked: true },
  { key: "delivered",       label: "Delivered to Firm",   track: "firm",     phase: "post_qa",  tone: "info", side: "firm",   qualify: "qualify",      requires_esign: false, billable: true, unlocks_firm: true,  is_final: false, lawruler_group: "Referred",       sort: 160, system_locked: true },
  { key: "retained",        label: "Retained",            track: "firm",     phase: "post_qa",  tone: "good", side: "firm",   qualify: "qualify",      requires_esign: false, billable: false, unlocks_firm: true,  is_final: false, lawruler_group: "Clients",        sort: 170, system_locked: true },
  { key: "dq",              label: "DQ",                  track: "terminal", phase: "terminal", tone: "bad",  side: "agent",  qualify: "disqualify",   requires_esign: false, billable: false, unlocks_firm: false, is_final: true,  lawruler_group: "Rejected",       sort: 180, system_locked: true },
  { key: "not_interested",  label: "Not Interested",      track: "terminal", phase: "terminal", tone: "bad",  side: "agent",  qualify: "disqualify",   requires_esign: false, billable: false, unlocks_firm: false, is_final: true,  lawruler_group: "New/Open",       sort: 190, system_locked: true },
  { key: "dnc",             label: "Do Not Call",         track: "terminal", phase: "terminal", tone: "bad",  side: "agent",  qualify: "disqualify",   requires_esign: false, billable: false, unlocks_firm: false, is_final: true,  lawruler_group: "New/Open",       sort: 200, system_locked: true },
  { key: "duplicate",       label: "Duplicate",           track: "terminal", phase: "terminal", tone: "neut", side: "agent",  qualify: "disqualify",   requires_esign: false, billable: false, unlocks_firm: false, is_final: true,  lawruler_group: "New/Open",       sort: 210, system_locked: true },
  { key: "dead",            label: "Dead",                track: "terminal", phase: "terminal", tone: "bad",  side: "agent",  qualify: "disqualify",   requires_esign: false, billable: false, unlocks_firm: false, is_final: true,  lawruler_group: "Closed",         sort: 220, system_locked: true },
];

const DEFAULT_BY_KEY: Record<string, StatusDef> = Object.fromEntries(DEFAULT_STATUSES.map((s) => [s.key, s]));

// Resolve a status def, preferring a live list (from DB) and falling back to
// the default seed. Always returns something usable for rendering.
export function resolveStatus(key?: string, live?: StatusDef[]): StatusDef {
  const k = (key || "").toLowerCase();
  if (live && live.length) {
    const hit = live.find((s) => s.key === k);
    if (hit) return hit;
  }
  // Unknown key: show it in words ("contact_attempted" reads "Contact attempted").
  const words = String(key || "").replace(/_/g, " ").trim();
  return DEFAULT_BY_KEY[k] ?? { ...DEFAULT_BY_KEY["new"], key: k || "new", label: words ? words[0].toUpperCase() + words.slice(1) : "New" };
}

export function statusLabel(key?: string, live?: StatusDef[]): string {
  return resolveStatus(key, live).label;
}
export function statusTone(key?: string, live?: StatusDef[]): StatusTone {
  return resolveStatus(key, live).tone;
}
export function isDisqualify(key?: string, live?: StatusDef[]): boolean {
  return resolveStatus(key, live).qualify === "disqualify";
}
export function unlocksFirm(key?: string, live?: StatusDef[]): boolean {
  return resolveStatus(key, live).unlocks_firm === true;
}
export function isBillable(key?: string, live?: StatusDef[]): boolean {
  return resolveStatus(key, live).billable === true;
}
export function inQaPhase(key?: string, live?: StatusDef[]): boolean {
  return resolveStatus(key, live).phase === "in_qa";
}

export interface DqReason { key: string; label: string; category: string; sort: number; active?: boolean; }
export const DEFAULT_DQ_REASONS: DqReason[] = [
  { key: "sol",          label: "SOL",          category: "Eligibility",   sort: 10 },
  { key: "diagnosis",    label: "Diagnosis",    category: "Medical",       sort: 20 },
  { key: "already_rep",  label: "Already Rep",  category: "Representation", sort: 30 },
  { key: "criteria",     label: "Criteria",     category: "Eligibility",   sort: 40 },
  { key: "prior_signup", label: "Prior Signup", category: "Representation", sort: 50 },
  { key: "location",     label: "Location",     category: "Eligibility",   sort: 60 },
  { key: "duplicate",    label: "Duplicate",    category: "Contact",       sort: 70 },
  { key: "no_contact",   label: "No Contact",   category: "Contact",       sort: 80 },
  { key: "other",        label: "Other",        category: "Other",         sort: 90 },
];


// ============================================================================
// LEADS vs CLIENTS
//
// A lead is someone we still need to chase. The moment they sign they are not a
// lead any more, and leaving them on the Leads page turns a work queue into a
// list of everyone who ever called.
//
// Defined once, here, because the Leads page and the Signed page both have to
// answer the same question and must never answer it differently.
//
// Covers the whole post-signature track: the QA states a signed file passes
// through, approval, delivery and retention. Deliberately includes
// signed_dropped, because a file that signed and then fell apart is still not
// something an agent should be calling back.
export function isSignedStatus(key: string | null | undefined): boolean {
  const k = String(key ?? "");
  if (!k) return false;
  if (k.startsWith("signed_")) return true;
  return k === "delivered" || k === "retained";
}

// The one definition of "this status means the file carries a signature".
// From the status table's own flags (an e-sign status past the pre-signature
// phase), plus the post-QA outcomes a signed file lands in (Delivered,
// Retained), plus the signed_* name family as the fallback when flags are
// not loaded. Reports and any future counter read THIS, never a local rule
// (Astra round 3: a local predicate dropped Delivered/Retained).
export function signedStatusKeys(statuses: { key: string; phase?: string | null; requires_esign?: boolean | null }[]): Set<string> {
  // Seeded from isSignedStatus's constant family so a caller with no status
  // catalog (the firm report) still counts Delivered and Retained, then
  // widened by the table's own e-sign flags.
  const keys = new Set<string>(["signed", "delivered", "retained"]);
  for (const s of statuses ?? []) {
    if (s.requires_esign === true && s.phase && s.phase !== "pre_qa") keys.add(s.key);
    if (isSignedStatus(s.key)) keys.add(s.key);
  }
  keys.delete("esign_sent");
  return keys;
}

