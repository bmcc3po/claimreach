export const DESK_TABS = [
  ["new", "NEW"], ["calling", "CONTINUE CALLING"], ["callbacks", "CALLBACK SCHEDULED"],
  ["sent", "SENT ESIGN"], ["signed", "SIGNED ESIGN"], ["wip", "WIP"],
] as const;
export type DeskTab = typeof DESK_TABS[number][0];
export interface DeskRow {
  id: string; claimId?: string; name?: string | null; phone?: string | null; sub?: string | null;
  at?: string | null; due?: string | null; tag?: string | null; href?: string | null; newPhone?: string | null;
}
export type DeskQueues = Record<DeskTab, DeskRow[]>;
