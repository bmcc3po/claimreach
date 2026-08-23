// Tenant isolation for the m6 portal. Acceptance gate for launch.
// Run: npx tsx src/lib/m6-scope.test.ts
import {
  TMP_SLUG, M6_CAMPAIGN, M6_CASE_TYPE,
  canEnterM6App, m6LayoutDestination, isM6Lead, isM6PortalLead,
  m6CaseAccess, m6WriteAccess, filterM6StatusRows,
  lorShowsOnToday, isLorReadyStatus, mergeLorIngest,
  firmLandingPath, isSafeFirmNext, canFirmInsertM6Comm, bouncePath,
  type M6Actor, type M6LeadRow, type RedirectActor,
} from "./m6";
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
