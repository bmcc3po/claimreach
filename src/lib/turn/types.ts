// ClaimTurn desk types. Defined once. Demo PI files only — never leads.

export const TURN_DEMO_TODAY = "2026-08-29";
export const ORTIZ_FILE_ID = "tmp-1182";
export const ORTIZ_FILE_NO = "TMP-1182";

export type TurnRole = "attorney" | "paralegal";

export type WhyKey =
  | "client_phone"
  | "adjuster"
  | "clerk"
  | "mmi"
  | "left_to_treat"
  | "records"
  | "looking";

export type ContactPref = "unspecified" | "voice" | "text" | "voice_then_text";

export type TreatingStatus = "still treating" | "dropped off" | "unknown";

export type KeepLadder = {
  status: "gone-dark" | "human-spoke" | "steady";
  step: number;
};

export type Person = {
  id: string;
  role: "client" | "adjuster" | "staff" | "insured" | "other";
  firstName: string;
  lastName: string;
  phone: string | null;
  org: string | null;
};

export type Provider = {
  id: string;
  name: string;
  kind: string;
  lastVisit: string | null;
  nextVisit: string | null;
  nextTime: string | null;
  cadence: string | null;
  onFile: boolean;
};

export type DocPointer = {
  id: string;
  kind: string;
  label: string;
  on: string | null;
  pointer: string;
};

export type AclRow = {
  name: string;
  role: string;
  access: "file" | "firm";
};

export type Carrier = {
  id: string;
  name: string;
  claimNo: string;
  insured: string | null;
  adjusterPersonId: string | null;
  lorMailedOn: string | null;
  lorChannel: string | null;
  lorInClaimNotes: boolean | null;
  limitsRequestedOn: string | null;
  limitsIn: boolean;
  lastOffer: string | null;
};

export type Lien = {
  id: string;
  holder: string;
  status: string;
  amount: string | null;
};

export type SendLogRow = {
  id: string;
  kind: "lor" | "sms" | "letter" | "email";
  status: "queued" | "draft" | "sent" | "blocked";
  channel: string;
  toLabel: string;
  body: string;
  createdOn: string;
  live: false;
};

export type TurnTask = {
  id: string;
  owner: string;
  playbook: "KEEP" | "NOTICE" | "COVER";
  title: string;
  due: string;
  dueLabel: string;
  status: "open" | "assigned" | "queued" | "set";
};

export type TurnNote = {
  id: string;
  kind: "call" | "file";
  party: string;
  author: string;
  body: string;
  createdOn: string;
  createdAtLabel: string;
};

export type TimelineRow = {
  id: string;
  on: string;
  label: string;
  kind: string;
  text: string;
};

export type TurnFile = {
  id: string;
  fileNo: string;
  firmSlug: "tmp";
  office: "Vegas";
  caseType: "MVA";
  phase: string;
  venue: string;
  doi: string;
  sol: string;
  injuries: string[];
  mmi: boolean | null;
  treatingStatus: TreatingStatus;
  lastTreatKind: string | null;
  lastTreatOn: string | null;
  nextTreatKind: string | null;
  nextTreatOn: string | null;
  nextTreatWhere: string | null;
  nextTreatTime: string | null;
  leftToTreat: string[];
  recordsIn: number;
  recordsTotal: number;
  lastHumanOn: string | null;
  lastHumanWho: string | null;
  lastHumanHow: string | null;
  keep: KeepLadder;
  pdCheckReceived: boolean | null;
  clientPref: ContactPref;
  people: Person[];
  providers: Provider[];
  carriers: Carrier[];
  liens: Lien[];
  documents: DocPointer[];
  acl: AclRow[];
  sendLog: SendLogRow[];
  tasks: TurnTask[];
  notes: TurnNote[];
  timeline: TimelineRow[];
  asks: AskState;
  draftSms: DraftSms | null;
  landed: boolean;
};

export type AskKey = "chiro" | "contact" | "pd_check";

export type AskState = Record<AskKey, string | null>;

export type DraftSms = {
  toName: string;
  body: string;
  status: "draft";
  blockedReason: string | null;
  sendEnabled: boolean;
};

export type DiffRow = {
  field: string;
  before: string;
  after: string;
  changed: boolean;
};

export type PlaybookHitId =
  | "notice_resend_lor"
  | "cover_tickler"
  | "keep_voice_pref"
  | "keep_maya_callback"
  | "keep_apologized";

export type PlaybookHit = {
  id: PlaybookHitId;
  playbook: "KEEP" | "NOTICE" | "COVER";
  label: string;
  button: string;
  detail: string;
  bolton: "postgrid" | "justcall" | null;
};

export type TurnPatch = {
  clientPref?: ContactPref;
  keepReset?: boolean;
  lastHumanOn?: string;
  lastHumanWho?: string;
  lastHumanHow?: string;
  lorDisputed?: boolean;
  adjusterWillEmailOn?: string | null;
  askedLimitsAgain?: boolean;
  pdCheckMentioned?: boolean;
  callbackOwner?: string;
  callbackWhen?: string;
  noteParty?: "Client" | "Adjuster" | "Clerk" | "File";
  noteAuthor?: string;
};

export type IngestResult = {
  source: "haiku" | "fallback";
  sourceLabel: string;
  answer?: string;
  note: string;
  noteMeta: string;
  diff: DiffRow[];
  hits: PlaybookHit[];
  patch: TurnPatch;
  writes: { key: string; value: string }[];
};

export const WHY_CHIPS: { key: WhyKey; label: string }[] = [
  { key: "client_phone", label: "Client on the phone" },
  { key: "adjuster", label: "Adjuster call" },
  { key: "clerk", label: "Clerk / court" },
  { key: "mmi", label: "Did we hit MMI" },
  { key: "left_to_treat", label: "What's left to treat" },
  { key: "records", label: "Records stuck" },
  { key: "looking", label: "Just looking" },
];

export const MISSING = "not on the file";
