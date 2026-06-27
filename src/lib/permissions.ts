// ============================================================================
// ClaimReach permissions. Granular capabilities, grouped. Each user has a role
// (which sets sensible defaults) PLUS per-user overrides for full control.
// Effective permission = override if set, else role default.
// ============================================================================

export type PermKey =
  | "leads.view" | "leads.edit" | "leads.delete" | "leads.bulk" | "leads.assign" | "leads.export"
  | "intake.fill" | "intake.qa"
  | "tier.edit"
  | "claims.status"
  | "forms.build"
  | "reports.view"
  | "money.view"            // see commission / dollar amounts
  | "calls.log" | "messages.send" | "docs.upload"
  | "drips.manage"
  | "crissi.use" | "academy.use" | "academy.records"
  | "users.manage" | "settings.manage"
  | "firm.portal";          // access the firm-facing portal

export interface PermDef { key: PermKey; label: string; group: string; }

export const PERMISSIONS: PermDef[] = [
  { key: "leads.view", label: "View leads", group: "Leads" },
  { key: "leads.edit", label: "Edit leads", group: "Leads" },
  { key: "leads.delete", label: "Delete leads", group: "Leads" },
  { key: "leads.bulk", label: "Bulk actions", group: "Leads" },
  { key: "leads.assign", label: "Assign leads", group: "Leads" },
  { key: "leads.export", label: "Export leads", group: "Leads" },
  { key: "intake.fill", label: "Run intake", group: "Intake" },
  { key: "intake.qa", label: "QA / review intakes", group: "Intake" },
  { key: "tier.edit", label: "Set tiers", group: "Intake" },
  { key: "claims.status", label: "Change claim status/stage", group: "Intake" },
  { key: "forms.build", label: "Build intake forms", group: "Builder" },
  { key: "reports.view", label: "View reports", group: "Reports" },
  { key: "money.view", label: "See dollar amounts / commission", group: "Money" },
  { key: "calls.log", label: "Log calls", group: "Casework" },
  { key: "messages.send", label: "Send case messages", group: "Casework" },
  { key: "docs.upload", label: "Upload documents", group: "Casework" },
  { key: "drips.manage", label: "Manage drip campaigns", group: "Casework" },
  { key: "crissi.use", label: "Use Crissi", group: "Crissi" },
  { key: "academy.use", label: "Take the Academy", group: "Crissi" },
  { key: "academy.records", label: "View training records", group: "Crissi" },
  { key: "users.manage", label: "Manage users & permissions", group: "Admin" },
  { key: "settings.manage", label: "Manage settings", group: "Admin" },
  { key: "firm.portal", label: "Access firm portal", group: "Access" },
];

export const PERM_GROUPS = Array.from(new Set(PERMISSIONS.map((p) => p.group)));

export type Role = "owner" | "admin" | "agent" | "qa" | "firm";

export const ROLES: { role: Role; label: string; desc: string }[] = [
  { role: "owner", label: "Owner", desc: "Full access to everything." },
  { role: "admin", label: "Admin / Manager", desc: "Manage the floor, users, forms, reports." },
  { role: "agent", label: "Agent", desc: "Run intakes, log calls, use Crissi." },
  { role: "qa", label: "QA", desc: "Review intakes, no money, no user management." },
  { role: "firm", label: "Firm (client)", desc: "Firm portal only, their own cases." },
];

// Role default permissions. '*' = all. Effective perms override these per-user.
const ALL: PermKey[] = PERMISSIONS.map((p) => p.key);
export const ROLE_DEFAULTS: Record<Role, PermKey[]> = {
  owner: ALL,
  admin: ALL.filter((k) => k !== "firm.portal"),
  agent: ["leads.view", "leads.edit", "leads.assign", "intake.fill", "tier.edit", "claims.status", "calls.log", "messages.send", "docs.upload", "reports.view", "crissi.use", "academy.use"],
  qa: ["leads.view", "intake.qa", "tier.edit", "claims.status", "calls.log", "messages.send", "crissi.use", "academy.use", "reports.view"],
  firm: ["firm.portal", "leads.view", "claims.status", "messages.send", "docs.upload", "reports.view", "crissi.use", "tier.edit"],
};

// Effective check: override map wins; else role default.
export function can(role: string, overrides: Record<string, boolean> | null | undefined, key: PermKey): boolean {
  if (overrides && key in overrides) return !!overrides[key];
  const defaults = ROLE_DEFAULTS[(role as Role)] ?? [];
  return defaults.includes(key);
}

export function effectivePerms(role: string, overrides: Record<string, boolean> | null | undefined): Record<PermKey, boolean> {
  const out = {} as Record<PermKey, boolean>;
  for (const p of PERMISSIONS) out[p.key] = can(role, overrides, p.key);
  return out;
}
