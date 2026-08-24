// Tenant isolation for the m6 portal. Acceptance gate for launch.
// Run: npx tsx src/lib/m6-scope.test.ts
import {
  TMP_SLUG, M6_CAMPAIGN, M6_CASE_TYPE, PURPOSES,
  canEnterM6App, m6LayoutDestination, isM6Lead, isM6PortalLead,
  m6CaseAccess, m6WriteAccess, filterM6StatusRows,
  lorShowsOnToday, isLorReadyStatus, mergeLorIngest,
  firmLandingPath, isSafeFirmNext, canFirmInsertM6Comm, bouncePath,
  canCallM6LogTouch, firmMayUpdateLeadColumns, dueAtFromDateInput,
  formatLocalDateTime,
  classifyLrAttachment, lrAttachmentPlan, SECONDARY_INTERVIEW_DOC_TYPE, SECONDARY_INTERVIEW_TITLE,
  authenticateIntakeEmail, pickSecondaryInterviewPdf, parseM6IntakeSubject, senderDomainAllowed,
  type M6Actor, type M6LeadRow, type RedirectActor,
} from "./m6";
import { firstNonEmpty, inboundCanonicalId, mapInbound, canonicalToLeadColumns } from "./webhooks";
import { composeLorLetter } from "./m6-lor";
import { isInternalRole } from "./permissions";
import { firmAccessEmailMatch, needsFirmProvision, wouldProvisionFromAllowlist, provisionRpcFailed } from "./firm-home";

const TMP = "firm-tmp";
const TMT = "firm-tmt";
const INNO = "firm-inno";

const staff: M6Actor = { role: "agent", firmSlug: "inno" };
const owner: M6Actor = { role: "owner", firmSlug: "inno" };
const tmpFirm: M6Actor = { role: "firm", firmSlug: TMP_SLUG };
const tmtFirm: M6Actor = { role: "firm", firmSlug: "tmt" };
const rothFirm: M6Actor = { role: "firm", firmSlug: "roth" };

function lead(partial: Partial<M6LeadRow> & Pick<M6LeadRow, "id" | "firm_id">): M6LeadRow {
  return { campaign: null, case_type: "mva", archived_at: null, ...partial };
}

const tmpMotel: M6LeadRow = lead({
  id: "uuid-tmp-motel", firm_id: TMP,
  campaign: M6_CAMPAIGN, case_type: M6_CASE_TYPE,
});
const tmpMotelCaseTypeOnly: M6LeadRow = lead({
  id: "uuid-tmp-old", firm_id: TMP,
  campaign: "TMP MOTEL_TRAFFICKING", case_type: M6_CASE_TYPE,
});
const tmpMva: M6LeadRow = lead({
  id: "uuid-tmp-mva", firm_id: TMP,
  campaign: "tmp-auto", case_type: "mva",
});
const tmtAuto: M6LeadRow = lead({
  id: "uuid-tmt-auto", firm_id: TMT,
  campaign: null, case_type: "mva",
});
const tmtMotelShaped: M6LeadRow = lead({
  id: "uuid-tmt-motel-residue", firm_id: TMT,
  campaign: M6_CAMPAIGN, case_type: M6_CASE_TYPE,
});
const otherFirmMotel: M6LeadRow = lead({
  id: "uuid-roth-motel", firm_id: INNO,
  campaign: M6_CAMPAIGN, case_type: M6_CASE_TYPE,
});
const archivedTmpMotel: M6LeadRow = lead({
  id: "uuid-archived", firm_id: TMP,
  campaign: M6_CAMPAIGN, case_type: M6_CASE_TYPE,
  archived_at: "2026-01-01T00:00:00Z",
});

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log("\nSLUG");
check("TMP slug is tmp, verified in production", TMP_SLUG, "tmp");
check("secondary interview is a purpose", PURPOSES.some((p) => p.value === "interview"), true);

console.log("\nLAYOUT GATE");
check("unsigned → firm-login", m6LayoutDestination(null), "firm-login");
check("staff may enter", canEnterM6App(staff), true);
check("owner may enter", canEnterM6App(owner), true);
check("TMP firm may enter", canEnterM6App(tmpFirm), true);
check("TMT firm is redirected to portal, not an empty page", m6LayoutDestination(tmtFirm), "portal");
check("Roth firm is redirected to portal", m6LayoutDestination(rothFirm), "portal");
check("TMT firm cannot enter", canEnterM6App(tmtFirm), false);

console.log("\nWHAT COUNTS AS AN M6 FILE");
check("campaign motel6 is m6", isM6Lead(tmpMotel), true);
check("OR: case_type only (older intake) is m6", isM6Lead(tmpMotelCaseTypeOnly), true);
check("TMP MVA is not m6", isM6Lead(tmpMva), false);
check("archived motel is not live m6", isM6Lead(archivedTmpMotel), false);
check("TMP motel is a portal file", isM6PortalLead(tmpMotel, TMP), true);
check("motel-shaped row at TMT is NOT a portal file", isM6PortalLead(tmtMotelShaped, TMP), false);

console.log("\nCASE PAGE — /m6/cases/<uuid> is notFound for every non-m6, including staff");
check("staff + TMT auto uuid → notFound (the shell leak)", m6CaseAccess(staff, tmtAuto, TMP), "notFound");
check("owner + TMT auto uuid → notFound", m6CaseAccess(owner, tmtAuto, TMP), "notFound");
check("staff + missing uuid → notFound", m6CaseAccess(staff, null, TMP), "notFound");
check("staff + TMP MVA uuid → notFound", m6CaseAccess(staff, tmpMva, TMP), "notFound");
check("staff + archived TMP motel → notFound", m6CaseAccess(staff, archivedTmpMotel, TMP), "notFound");
check("staff + motel-shaped at another firm → notFound", m6CaseAccess(staff, tmtMotelShaped, TMP), "notFound");
check("staff + residue at inno → notFound", m6CaseAccess(staff, otherFirmMotel, TMP), "notFound");
check("TMP firm + TMT auto uuid → notFound", m6CaseAccess(tmpFirm, tmtAuto, TMP), "notFound");
check("TMP firm + own MVA uuid → notFound", m6CaseAccess(tmpFirm, tmpMva, TMP), "notFound");
check("TMT firm + anything → notFound (never render the shell)", m6CaseAccess(tmtFirm, tmtAuto, TMP), "notFound");
check("TMT firm + TMP motel uuid → notFound", m6CaseAccess(tmtFirm, tmpMotel, TMP), "notFound");
check("staff + TMP motel → ok", m6CaseAccess(staff, tmpMotel, TMP), "ok");
check("staff + older TMP motel (case_type only) → ok", m6CaseAccess(staff, tmpMotelCaseTypeOnly, TMP), "ok");
check("TMP firm + TMP motel → ok", m6CaseAccess(tmpFirm, tmpMotel, TMP), "ok");

console.log("\nWRITES");
check("TMT firm cannot write", m6WriteAccess(tmtFirm, tmpMotel, TMP), "forbidden");
check("staff cannot write a TMT auto file", m6WriteAccess(staff, tmtAuto, TMP), "notFound");
check("TMP firm cannot write own MVA through m6", m6WriteAccess(tmpFirm, tmpMva, TMP), "notFound");
check("TMP firm can write own motel file", m6WriteAccess(tmpFirm, tmpMotel, TMP), "ok");
check("staff can write TMP motel", m6WriteAccess(staff, tmpMotel, TMP), "ok");

console.log("\nLIST FILTER — mixed board never leaks a non-motel6 row");
const mixed = [
  { firm_id: TMP, campaign: M6_CAMPAIGN, case_type: M6_CASE_TYPE, archived_at: null, lead_id: "a" },
  { firm_id: TMP, campaign: "auto", case_type: "mva", archived_at: null, lead_id: "b" },
  { firm_id: TMT, campaign: M6_CAMPAIGN, case_type: M6_CASE_TYPE, archived_at: null, lead_id: "c" },
  { firm_id: TMT, campaign: null, case_type: "mva", archived_at: null, lead_id: "d" },
  { firm_id: TMP, campaign: M6_CAMPAIGN, case_type: M6_CASE_TYPE, archived_at: "2026-01-01", lead_id: "e" },
];
const kept = filterM6StatusRows(mixed, TMP);
check("only the live TMP motel row survives", kept.map((r) => r.lead_id), ["a"]);
check("TMT firm actor would still not receive TMT rows from this filter",
  filterM6StatusRows(mixed, TMP).some((r) => r.firm_id === TMT), false);

// ---------------------------------------------------------------------------
// 0085 RLS people predicates. Mirrors supabase/migrations/0085_rls_hardening.sql.
// contacts/claimants have no firm_id — internal-only. status_events firm read
// is EXISTS (leads.id = lead_id AND leads.firm_id = my_firm_id()).
// ---------------------------------------------------------------------------
function canSeeContactsOrClaimants(actor: M6Actor | { role: string | null }): boolean {
  return isInternalRole(actor.role);
}
function canSeeStatusEvent(
  actor: M6Actor | { role: string | null },
  actorFirmId: string | null,
  eventLeadFirmId: string,
): boolean {
  if (isInternalRole(actor.role)) return true;
  if (actor.role !== "firm") return false;
  return actorFirmId !== null && actorFirmId === eventLeadFirmId;
}

console.log("\n0085 RLS — contacts / claimants (internal-only, no firm_id)");
check("staff may see contacts/claimants", canSeeContactsOrClaimants(staff), true);
check("owner may see contacts/claimants", canSeeContactsOrClaimants(owner), true);
check("TMP firm must NOT see contacts/claimants", canSeeContactsOrClaimants(tmpFirm), false);
check("TMT firm must NOT see contacts/claimants", canSeeContactsOrClaimants(tmtFirm), false);
check("Roth firm must NOT see contacts/claimants", canSeeContactsOrClaimants(rothFirm), false);
check("unsigned must NOT see contacts/claimants", canSeeContactsOrClaimants({ role: null }), false);

console.log("\n0085 RLS — status_events (internal-all; firm read only own leads)");
check("staff may see another firm's status_event", canSeeStatusEvent(staff, INNO, TMT), true);
check("TMP firm may see own lead's status_event", canSeeStatusEvent(tmpFirm, TMP, TMP), true);
check("TMT firm must NOT see TMP lead's status_event", canSeeStatusEvent(tmtFirm, TMT, TMP), false);
check("TMP firm must NOT see TMT lead's status_event", canSeeStatusEvent(tmpFirm, TMP, TMT), false);
check("unsigned must NOT see status_events", canSeeStatusEvent({ role: null }, null, TMP), false);

console.log("\nLOR (Phase G)");
check("empty row stays off Today", lorShowsOnToday(null), false);
check("ready shows on Today", lorShowsOnToday({ status: "ready", flagged_today: false }), true);
check("flag alone shows on Today", lorShowsOnToday({ status: "not_sent", flagged_today: true }), true);
check("sent never shows on Today even if flagged", lorShowsOnToday({ status: "sent", flagged_today: true }), false);
check("LawRuler status string matches", isLorReadyStatus("Secondary intake OK sent to firm"), true);
check("other LawRuler status does not", isLorReadyStatus("Signed"), false);
check("ingest does not downgrade sent to ready", mergeLorIngest(
  { status: "sent", flagged_today: false },
  { status: "ready", flagged_today: true },
), { status: "sent", flagged_today: false });
check("ingest marks ready on first fire", mergeLorIngest(null, { status: "ready" }), { status: "ready", flagged_today: true });

console.log("\n0087 RLS — firm INSERT communications (manual m6 only)");
const tmpMotelLead = tmpMotel;
const tmpMvaLead = tmpMva;
const tmtMotelLead = tmtMotelShaped;
check("TMP firm may insert a manual touch on own motel file", canFirmInsertM6Comm({
  actor: tmpFirm, actorFirmId: TMP, lead: tmpMotelLead, tmpFirmId: TMP, logged_manually: true,
}), true);
check("TMT firm cannot insert", canFirmInsertM6Comm({
  actor: tmtFirm, actorFirmId: TMT, lead: tmpMotelLead, tmpFirmId: TMP, logged_manually: true,
}), false);
check("TMT firm cannot insert on TMT motel-shaped residue", canFirmInsertM6Comm({
  actor: tmtFirm, actorFirmId: TMT, lead: tmtMotelLead, tmpFirmId: TMP, logged_manually: true,
}), false);
check("TMP firm cannot insert on a non-m6 lead", canFirmInsertM6Comm({
  actor: tmpFirm, actorFirmId: TMP, lead: tmpMvaLead, tmpFirmId: TMP, logged_manually: true,
}), false);
check("TMP firm cannot insert a system-comm row", canFirmInsertM6Comm({
  actor: tmpFirm, actorFirmId: TMP, lead: tmpMotelLead, tmpFirmId: TMP, logged_manually: false,
}), false);
check("staff do not use the firm-insert policy (comm_internal covers them)", canFirmInsertM6Comm({
  actor: staff, actorFirmId: INNO, lead: tmpMotelLead, tmpFirmId: TMP, logged_manually: true,
}), false);

console.log("\n0089 RPC + GUARD — firm JWT cannot PATCH clock fields outside the RPC");
check("TMP firm may call m6_log_touch on own motel file", canCallM6LogTouch({
  actor: tmpFirm, actorFirmId: TMP, lead: tmpMotelLead, tmpFirmId: TMP,
}), true);
check("staff may call m6_log_touch on a TMP motel file", canCallM6LogTouch({
  actor: staff, actorFirmId: INNO, lead: tmpMotelLead, tmpFirmId: TMP,
}), true);
check("TMT firm cannot call m6_log_touch", canCallM6LogTouch({
  actor: tmtFirm, actorFirmId: TMT, lead: tmpMotelLead, tmpFirmId: TMP,
}), false);
check("direct firm UPDATE of stage is still allowed", firmMayUpdateLeadColumns({
  changed: ["stage"], nestedTrigger: false,
}), true);
check("direct firm UPDATE of retention_stage is blocked", firmMayUpdateLeadColumns({
  changed: ["retention_stage"], nestedTrigger: false,
}), false);
check("direct firm UPDATE of current_status is blocked", firmMayUpdateLeadColumns({
  changed: ["current_status"], nestedTrigger: false,
}), false);
check("direct firm UPDATE of last_two_way_at is blocked", firmMayUpdateLeadColumns({
  changed: ["last_two_way_at"], nestedTrigger: false,
}), false);
check("nested two_way may move retention_stage", firmMayUpdateLeadColumns({
  changed: ["retention_stage"], nestedTrigger: true,
}), true);
check("nested two_way may not move stage", firmMayUpdateLeadColumns({
  changed: ["stage"], nestedTrigger: true,
}), false);
check("nested two_way may not move current_status", firmMayUpdateLeadColumns({
  changed: ["current_status"], nestedTrigger: true,
}), false);
check("nested two_way may not write last_two_way_at (view-derived)", firmMayUpdateLeadColumns({
  changed: ["last_two_way_at"], nestedTrigger: true,
}), false);
check("nested two_way may not write next_touch_due (view-derived)", firmMayUpdateLeadColumns({
  changed: ["next_touch_due"], nestedTrigger: true,
}), false);
check("nested two_way ignores generated full_name/phone_norm", firmMayUpdateLeadColumns({
  changed: ["retention_stage", "updated_at", "full_name", "phone_norm"], nestedTrigger: true,
}), true);
check("direct stage update ignores generated cols too", firmMayUpdateLeadColumns({
  changed: ["stage", "updated_at", "full_name", "phone_norm"], nestedTrigger: false,
}), true);
check("generated cols do not open PII", firmMayUpdateLeadColumns({
  changed: ["full_name", "phone"], nestedTrigger: true,
}), false);

console.log("\nLAWRULER INGEST — lastname + zip aliases, one map");
check("lastname (no underscore) maps", inboundCanonicalId("lastname"), "claimant_last_name");
check("last_name also maps", inboundCanonicalId("last_name"), "claimant_last_name");
check("first_name maps", inboundCanonicalId("first_name"), "claimant_first_name");
check("firstname (no underscore) also maps", inboundCanonicalId("firstname"), "claimant_first_name");
check("zip maps to mail_zip", inboundCanonicalId("zip"), "mail_zip");
check("postal alias maps to mail_zip", inboundCanonicalId("postal"), "mail_zip");
check("live LR shape: first_name + lastname", canonicalToLeadColumns(mapInbound({
  first_name: "Ada", lastname: "Lovelace", zip: "89101",
})), {
  first_name: "Ada", last_name: "Lovelace", claimant_name: null,
  phone: null, email: null, case_type: null, campaign: null, external_id: null,
  mail_addr1: null, mail_addr2: null, mail_city: null, mail_state: null, mail_zip: "89101",
  dob: null, handling_attorney: null, marketing_source: null,
});
const certified = canonicalToLeadColumns(mapInbound({
  first_name: "Bob", lastname: "Builder", zip: "39201",
}));
const fromCertified = composeLorLetter({
  firstName: certified.first_name, lastName: certified.last_name, gender: "male",
  incidentStart: "2019-04-01", incidentEnd: "2019-06-15",
  propertyName: "Motel 6", propertyStreet: "100 Main",
  propertyCity: "Jackson", propertyState: "MS", propertyZip: "39201",
});
check("certified lastname reaches the TMP letter", fromCertified.clientName, "Bob Builder");
check("letter from lastname is the TMP letter", fromCertified.body.includes("Dear Sir or Madam:"), true);
check("firstNonEmpty prefers first real value", firstNonEmpty("", "{{token}}", "Smith", "Other"), "Smith");
check("firstNonEmpty strips LR test placeholders", firstNonEmpty("{{default23}}-Last Name"), null);
check("date input becomes an ISO timestamp", !!dueAtFromDateInput("2026-08-24"), true);
check("bad date input is null", dueAtFromDateInput("soon"), null);
check("local datetime includes a time", /[0-9].*:|\d\s?[AP]M/i.test(formatLocalDateTime("2026-08-23T19:05:00Z")), true);

console.log("\nFIRM LOGIN LANDING");
check("/portal default is not a deep link", isSafeFirmNext("/portal"), null);
check("/m6 is a safe next", isSafeFirmNext("/m6"), "/m6");
check("protocol-relative is rejected", isSafeFirmNext("//evil"), null);
check("TMP m6 recipient lands on /m6", firmLandingPath({ role: "firm", isM6Recipient: true, requestedNext: "/portal" }), "/m6");
check("TMP portal user stays on /portal", firmLandingPath({ role: "firm", isM6Recipient: false, requestedNext: "/portal" }), "/portal");
check("staff land on /dashboard", firmLandingPath({ role: "agent", isM6Recipient: false, requestedNext: "/portal" }), "/dashboard");
check("deep /m6 path is honored", firmLandingPath({ role: "firm", isM6Recipient: true, requestedNext: "/m6/cases/abc" }), "/m6/cases/abc");
check("unknown role does not guess /dashboard", firmLandingPath({ role: null, isM6Recipient: true }), null);

const hubs = ["/login", "/firm-login", "/dashboard", "/m6", "/portal", "/leads", "/"];
const graphActors: { name: string; actor: RedirectActor }[] = [
  { name: "unsigned", actor: { signedIn: false, role: null, isM6Recipient: false, firmSlug: null } },
  { name: "signed, no profile", actor: { signedIn: true, role: null, isM6Recipient: false, firmSlug: null } },
  { name: "signed, no profile, m6 email", actor: { signedIn: true, role: null, isM6Recipient: true, firmSlug: null } },
  { name: "firm+m6", actor: { signedIn: true, role: "firm", isM6Recipient: true, firmSlug: TMP_SLUG } },
  { name: "firm non-m6 TMP", actor: { signedIn: true, role: "firm", isM6Recipient: false, firmSlug: TMP_SLUG } },
  { name: "TMT firm", actor: { signedIn: true, role: "firm", isM6Recipient: false, firmSlug: "tmt" } },
  { name: "agent", actor: { signedIn: true, role: "agent", isM6Recipient: false, firmSlug: "inno" } },
  { name: "owner", actor: { signedIn: true, role: "owner", isM6Recipient: false, firmSlug: "inno" } },
];

console.log("\nREDIRECT GRAPH — no route bounces to a route that bounces back");
for (const { name, actor } of graphActors) {
  for (const from of hubs) {
    const to = bouncePath(from, actor);
    if (!to || to === from) continue;
    const back = bouncePath(to, actor);
    check(`${name}: ${from} → ${to} does not return to ${from}`, back === from, false);
  }
}

const firmM6: RedirectActor = { signedIn: true, role: "firm", isM6Recipient: true, firmSlug: TMP_SLUG };
const firmPortal: RedirectActor = { signedIn: true, role: "firm", isM6Recipient: false, firmSlug: TMP_SLUG };
const staffActor: RedirectActor = { signedIn: true, role: "agent", isM6Recipient: false, firmSlug: "inno" };
const noProfile: RedirectActor = { signedIn: true, role: null, isM6Recipient: true, firmSlug: null };

console.log("\nLOGIN CHAIN — each home exactly once");
check("firm+m6 /dashboard → /m6", bouncePath("/dashboard", firmM6), "/m6");
check("firm+m6 stays on /m6", bouncePath("/m6", firmM6), null);
check("firm+m6 /firm-login → /m6", bouncePath("/firm-login", firmM6), "/m6");
check("firm non-m6 /dashboard → /portal", bouncePath("/dashboard", firmPortal), "/portal");
check("firm non-m6 stays on /portal", bouncePath("/portal", firmPortal), null);
check("staff /firm-login → /dashboard", bouncePath("/firm-login", staffActor), "/dashboard");
check("staff stays on /dashboard", bouncePath("/dashboard", staffActor), null);
check("no profile /dashboard → /firm-login (not /portal)", bouncePath("/dashboard", noProfile), "/firm-login");
check("no profile stays on /firm-login", bouncePath("/firm-login", noProfile), null);

console.log("\nLAWRULER INTERVIEW ATTACHMENTS");
const SAMPLE_PDF = "264972-Bob_T_Builder-IntakeForm.pdf";
const SAMPLE_CSV = "264972-Bob_T_Builder-Intake.csv";
check("PDF is secondary interview", classifyLrAttachment(SAMPLE_PDF).kind, "secondary_interview");
check("leadid is digits before first hyphen", classifyLrAttachment(SAMPLE_PDF).vendorLeadId, "264972");
check("CSV is thin intake", classifyLrAttachment(SAMPLE_CSV).kind, "intake_csv");
check("matching PDF is stored as Secondary interview", lrAttachmentPlan(SAMPLE_PDF, "264972"), {
  action: "store", kind: "secondary_interview", vendorLeadId: "264972",
  docType: SECONDARY_INTERVIEW_DOC_TYPE, fileName: SECONDARY_INTERVIEW_TITLE,
});
check("CSV is skipped", lrAttachmentPlan(SAMPLE_CSV, "264972").action, "skip");
check("CSV skip reason is csv_thin", (lrAttachmentPlan(SAMPLE_CSV, "264972") as any).reason, "csv_thin");
check("mismatched PDF is not stored on the wrong file", lrAttachmentPlan(SAMPLE_PDF, "999").action, "skip");
check("mismatch reason is leadid_mismatch", (lrAttachmentPlan(SAMPLE_PDF, "999") as any).reason, "leadid_mismatch");
check("IntakeForm without a numeric leadid prefix is skipped", lrAttachmentPlan("Bob_T_Builder-IntakeForm.pdf", "264972").action, "skip");

console.log("\nLAWRULER EMAIL INTAKE");
const TOKEN = "test-token-aabbcc";
const INTAKE = "m6-intake@inbound.claimreach.com";
const PDF = "264972-Bob_T_Builder-IntakeForm.pdf";
const CSV = "264972-Bob_T_Builder-Intake.csv";
check("subject token only, no leadid", parseM6IntakeSubject("M6INTAKE " + TOKEN), TOKEN);
check("junk around the subject is rejected", parseM6IntakeSubject("FW: M6INTAKE " + TOKEN), null);
check("via law.lawruler.net is allowed", senderDomainAllowed("Michael Perlman via law.lawruler.net"), true);
check("law.lawruler.net envelope is allowed", senderDomainAllowed("noreply@law.lawruler.net"), true);
check("gmail is not allowed", senderDomainAllowed("person@gmail.com"), false);
check("picks the IntakeForm PDF and skips the CSV", pickSecondaryInterviewPdf([CSV, PDF]), {
  filename: PDF, vendorLeadId: "264972",
});
check("CSV-only fire has no interview PDF", pickSecondaryInterviewPdf([CSV]), null);
check("auth ok: LawRuler from + token subject + intake to", authenticateIntakeEmail({
  from: "Michael Perlman via law.lawruler.net",
  to: INTAKE, subject: "M6INTAKE " + TOKEN, tokenCsv: TOKEN, intakeTo: INTAKE,
}).ok, true);
check("auth fails closed on a wrong token", authenticateIntakeEmail({
  from: "noreply@law.lawruler.net",
  to: INTAKE, subject: "M6INTAKE no-match", tokenCsv: TOKEN, intakeTo: INTAKE,
}).ok, false);
check("auth fails closed when no token is configured", authenticateIntakeEmail({
  from: "noreply@law.lawruler.net",
  to: INTAKE, subject: "M6INTAKE " + TOKEN, tokenCsv: "", intakeTo: INTAKE,
}).ok, false);
check("auth fails closed on the wrong recipient", authenticateIntakeEmail({
  from: "noreply@law.lawruler.net",
  to: "other@inbound.claimreach.com", subject: "M6INTAKE " + TOKEN, tokenCsv: TOKEN, intakeTo: INTAKE,
}).ok, false);

console.log("\n0088a PROVISION (callback is the primary path)");
check("callback provisions when app_users is missing", needsFirmProvision("uuid-1", null), true);
check("callback does not provision when the row exists", needsFirmProvision("uuid-1", { role: "firm" }), false);
check("unsigned does not provision", needsFirmProvision(null, null), false);
check("email match is lower(trim)", firmAccessEmailMatch("  BMC+M6Test@InnovativeIntake.com ", "bmc+m6test@innovativeintake.com"), true);
check("allowlist miss does not provision", wouldProvisionFromAllowlist({
  userId: "uuid-1", email: "bmc+m6test@innovativeintake.com", allowlist: null,
}), false);
check("allowlist hit provisions", wouldProvisionFromAllowlist({
  userId: "uuid-1",
  email: "bmc+m6test@innovativeintake.com",
  allowlist: { email: "bmc+m6test@innovativeintake.com", firm_slug: "tmp" },
}), true);
check("staff email not in firm_access is not provisioned as firm", wouldProvisionFromAllowlist({
  userId: "uuid-staff", email: "brett@claimreach.com", allowlist: null,
}), false);
check("RPC error is surfaced, not swallowed", provisionRpcFailed({ message: "permission denied" }), "permission denied");
check("no RPC error means continue to landing", provisionRpcFailed(null), null);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
