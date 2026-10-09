export const DESK_TABS = [
  ["due", "CALL NOW"], ["wait", "WAIT TO CALL"], ["callbacks", "CALLBACK SCHEDULED"],
  ["sent", "SENT ESIGN"], ["signed", "SIGNED ESIGN"], ["wip", "WIP"], ["review", "NEEDS REVIEW"],
] as const;
export type DeskTab = typeof DESK_TABS[number][0];
export interface DeskRow {
  id: string; claimId?: string; name?: string | null; phone?: string | null; sub?: string | null;
  at?: string | null; due?: string | null; receivedAt?: string | null; tag?: string | null; href?: string | null; newPhone?: string | null;
  outreach?: import("./outreach-stage").OutreachPlacement;
  callCount?: number | null; lastCallAt?: string | null;
  onPhoneBy?: string | null; intakeAgent?: string;
}
export type DeskQueues = Record<DeskTab, DeskRow[]>;
