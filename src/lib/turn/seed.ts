// One fake TMP file. Never a lead. Never live PII.

import {
  ORTIZ_FILE_ID,
  ORTIZ_FILE_NO,
  type Person,
  type Provider,
  type Carrier,
  type TurnFile,
} from "./types";

export const DEMO_ACTORS = {
  attorney: { name: "Jordan Hale", title: "Attorney" },
  paralegal: { name: "Maya Chen", title: "Paralegal" },
} as const;

const client: Person = {
  id: "p-ortiz",
  role: "client",
  firstName: "Samuel",
  lastName: "Ortiz",
  phone: "+1 702-555-0138",
  org: null,
};

const adjuster: Person = {
  id: "p-dana",
  role: "adjuster",
  firstName: "Dana",
  lastName: "Ruiz",
  phone: "800-555-0142",
  org: "State Farm",
};

const maya: Person = {
  id: "p-maya",
  role: "staff",
  firstName: "Maya",
  lastName: "Chen",
  phone: null,
  org: "TMP",
};

const insured: Person = {
  id: "p-webb",
  role: "insured",
  firstName: "Marcus",
  lastName: "Webb",
  phone: null,
  org: null,
};

const valley: Provider = {
  id: "prov-valley",
  name: "Valley Chiro",
  kind: "chiro",
  lastVisit: null,
  cadence: null,
  onFile: true,
};

const desert: Provider = {
  id: "prov-desert",
  name: "Desert Radiology",
  kind: "imaging",
  lastVisit: null,
  cadence: null,
  onFile: true,
};

const pt: Provider = {
  id: "prov-pt",
  name: "PT",
  kind: "pt",
  lastVisit: "2026-08-22",
  cadence: null,
  onFile: true,
};

const stateFarm: Carrier = {
  id: "car-sf",
  name: "State Farm",
  claimNo: "18-449201",
  insured: "Marcus Webb",
  adjusterPersonId: "p-dana",
  lorMailedOn: "2026-03-18",
  lorChannel: "PostGrid",
  lorInClaimNotes: null,
  limitsRequestedOn: "2026-08-01",
  limitsIn: false,
  lastOffer: null,
};

export function clientName(file: Pick<TurnFile, "people">): string {
  const c = file.people.find((p) => p.role === "client");
  return c ? `${c.firstName} ${c.lastName}` : "Unnamed file";
}

export function personByRole(file: TurnFile, role: Person["role"]): Person | null {
  return file.people.find((p) => p.role === role) ?? null;
}

export function providerByKind(file: TurnFile, kind: string): Provider | null {
  return file.providers.find((p) => p.kind === kind) ?? null;
}

export function primaryCarrier(file: TurnFile): Carrier | null {
  return file.carriers[0] ?? null;
}

export function seedOrtiz(): TurnFile {
  return {
    id: ORTIZ_FILE_ID,
    fileNo: ORTIZ_FILE_NO,
    firmSlug: "tmp",
    office: "Vegas",
    caseType: "MVA",
    phase: "Pre-lit / records",
    doi: "2026-03-12",
    sol: "2028-03-12",
    injuries: ["Lumbar strain", "L knee"],
    mmi: false,
    treatingStatus: "still treating",
    lastTreatKind: "PT",
    lastTreatOn: "2026-08-22",
    nextTreatKind: "MRI",
    nextTreatOn: "2026-09-04",
    nextTreatWhere: "Desert Radiology",
    nextTreatTime: "09:20",
    leftToTreat: ["MRI", "ortho"],
    recordsIn: 4,
    recordsTotal: 11,
    lastHumanOn: "2026-08-10",
    lastHumanWho: "Maya Chen",
    lastHumanHow: "VM",
    keep: { status: "gone-dark", step: 3 },
    pdCheckReceived: false,
    clientPref: "unspecified",
    people: [client, adjuster, maya, insured],
    providers: [valley, desert, pt],
    carriers: [stateFarm],
    liens: [],
    sendLog: [],
    tasks: [],
    notes: [],
    timeline: [
      { id: "t-lor", on: "2026-03-18", label: "NOTICE", kind: "NOTICE", text: "LOR mailed · PostGrid" },
      { id: "t-sf-mar", on: "2026-03-22", label: "them", kind: "carrier", text: "Called, said no claim # yet" },
      { id: "t-cover", on: "2026-08-01", label: "COVER", kind: "COVER", text: "Limits letter sent" },
      { id: "t-keep", on: "2026-08-10", label: "KEEP", kind: "KEEP", text: "Maya VM · no callback" },
      { id: "t-pt", on: "2026-08-22", label: "treat", kind: "treat", text: "PT · last visit" },
      { id: "t-mri", on: "2026-09-04", label: "next", kind: "next", text: "MRI · Desert Radiology 9:20" },
    ],
    asks: { chiro: null, contact: null, pd_check: null },
    draftSms: null,
    landed: false,
  };
}

export const TURN_FILES: Record<string, () => TurnFile> = {
  [ORTIZ_FILE_ID]: seedOrtiz,
};

export function listSeedFiles(): TurnFile[] {
  return [seedOrtiz()];
}

export function loadSeedFile(id: string): TurnFile | null {
  const make = TURN_FILES[id];
  return make ? make() : null;
}
