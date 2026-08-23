// ============================================================================
// File fence. ONE definition of what a viewer may see on a case file.
// Internal staff (/leads/[id]) and m6 firm (/m6/cases/[id]) share LeadWorkspace.
// The fence is the only thing that may differ. Do not fork a second file.
// ============================================================================

import type { Field } from "@/lib/questionnaire";

export type FileSurface = "internal" | "m6";
export type FileAudience = "staff" | "firm";

export type FileFence = {
  surface: FileSurface;
  audience: FileAudience;
};

export const INTERNAL_STAFF_FENCE: FileFence = { surface: "internal", audience: "staff" };
export const M6_FIRM_FENCE: FileFence = { surface: "m6", audience: "firm" };

export const FILE_TABS_CORE = [
  "Overview",
  "Case Questions",
  "Contact Info",
  "Case Details",
  "QA",
  "Retainer",
  "Messages",
  "Calls",
  "Notes",
  "Timeline",
  "Activity Log",
] as const;

export type FileTab = (typeof FILE_TABS_CORE)[number];

const QA_ROLES = new Set(["owner", "admin", "manager", "qa"]);

export function isFirmAudience(fence?: FileFence | null): boolean {
  return fence?.audience === "firm";
}

export function fileMaySeeMoney(fence?: FileFence | null): boolean {
  return !isFirmAudience(fence);
}

export function fileMayEditLead(fence?: FileFence | null): boolean {
  return !isFirmAudience(fence);
}

export function fileMayUseStaffTools(fence?: FileFence | null): boolean {
  return !isFirmAudience(fence);
}

export function fileMayRunQa(fence?: FileFence | null): boolean {
  return !isFirmAudience(fence);
}

export function fileMaySeeStaffQaNotes(fence?: FileFence | null): boolean {
  return !isFirmAudience(fence);
}

export function fileMaySendComms(fence?: FileFence | null): boolean {
  // Workspace JustCall compose stays staff-only. M6 cadence compose is a
  // separate rail (fileMayComposeM6) that logs first and live-sends only
  // when keys + Josh approval + gates pass.
  return !isFirmAudience(fence);
}

export function fileMayComposeM6(fence?: FileFence | null): boolean {
  return fence?.surface === "m6" || !isFirmAudience(fence);
}

export function fileMaySeeCrissiHub(fence?: FileFence | null): boolean {
  return !isFirmAudience(fence);
}

export function fileMayExportPdf(fence?: FileFence | null): boolean {
  return !isFirmAudience(fence);
}

export function fileBackHref(fence?: FileFence | null): string {
  return fence?.surface === "m6" ? "/m6/cases" : "/leads";
}

export function fileShowsQaTab(role: string | null | undefined, fence?: FileFence | null): boolean {
  if (isFirmAudience(fence)) return true;
  return QA_ROLES.has(role || "");
}

export function fileTabs(role: string | null | undefined, fence?: FileFence | null): FileTab[] {
  if (fileShowsQaTab(role, fence)) return [...FILE_TABS_CORE];
  return FILE_TABS_CORE.filter((t) => t !== "QA");
}

// Staff scripting never ships to the firm review. Same Field ids, no second form.
export function stripStaffFormFields(fields: Field[]): Field[] {
  return fields
    .filter((f) => f.kind !== "script")
    .map((f) => {
      const next: Field = { ...f };
      delete next.agentNote;
      delete next.script;
      if (next.choices) {
        next.choices = next.choices.map((c) => {
          const { note: _note, ...rest } = c;
          return rest;
        });
      }
      return next;
    });
}

const MONEY_DESC = /\$|bill[_\s-]?rate|commission|payout|week\s*pay|payroll/i;

export function isMoneyShapedAudit(entry: { description?: string | null; category?: string | null }): boolean {
  const text = `${entry.category ?? ""} ${entry.description ?? ""}`;
  return MONEY_DESC.test(text);
}

export function fileSafeAudit<T extends { description?: string | null; category?: string | null }>(
  entries: T[],
  fence?: FileFence | null,
): T[] {
  if (fileMaySeeMoney(fence)) return entries;
  return entries.filter((e) => !isMoneyShapedAudit(e));
}

export function isStaffOnlyDetailKey(key: string): boolean {
  return key === "case_rating" || key === "bill_rate" || key === "weekPay" || key === "tierA";
}
