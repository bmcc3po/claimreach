// Run: npx tsx src/lib/drip-dispatch.test.ts
// Drip kill switch, who may enroll, and the RLS-visible target rule.
// Offline: the session and service clients are fakes; nothing is enrolled.
import assert from "node:assert/strict";
import { can } from "./permissions";
import { gateUser } from "./gate";
import { dripDispatchEnabled, dripOffResult, mayManageDrips, enrollLeadInDrips, DRIP_OFF_MESSAGE } from "./drip-dispatch";

let passed = 0;
const tests: { name: string; fn: () => void | Promise<void> }[] = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push({ name, fn });

const user = (role: string, overrides: Record<string, boolean> = {}) => ({ role, can: (k: any) => can(role, overrides, k) });
const LEAD = "8f0e0e0e-aaaa-4bbb-8ccc-dddddddddddd";

// The session client sees only the rows RLS lets it see.
function session(visible: Record<string, any> | null, error: string | null = null) {
  const calls: any[] = [];
  return {
    calls,
    from(table: string) {
      const q: any = {
        _f: [] as any[],
        select() { return q; },
        eq(c: string, v: any) { q._f.push([c, v]); return q; },
        maybeSingle: async () => {
          calls.push({ table, filters: q._f });
          if (error) return { data: null, error: { message: error } };
          return { data: visible && q._f.every(([c, v]: any) => visible[c] === v) ? visible : null, error: null };
        },
      };
      return q;
    },
  };
}
function service(rpcError: string | null = null) {
  const rpcs: any[] = [];
  return { rpcs, rpc: async (name: string, args: any) => { rpcs.push({ name, args }); return { error: rpcError ? { message: rpcError } : null }; } };
}

t("kill switch: off unless exactly \"on\"", () => {
  assert.equal(dripDispatchEnabled({}), false);
  assert.equal(dripDispatchEnabled(undefined), false);
  assert.equal(dripDispatchEnabled({ DRIP_DISPATCH_ENABLED: "" }), false);
  assert.equal(dripDispatchEnabled({ DRIP_DISPATCH_ENABLED: "true" }), false);
  assert.equal(dripDispatchEnabled({ DRIP_DISPATCH_ENABLED: "ON" }), false);
  assert.equal(dripDispatchEnabled({ DRIP_DISPATCH_ENABLED: "on" }), true);
});

t("the off result says sending is off and nothing fired", () => {
  const r = dripOffResult();
  assert.deepEqual(r, { ok: false, sending: "off", fired: 0, error: DRIP_OFF_MESSAGE });
  assert.match(r.error, /^Drip sending is off/);
  assert.ok(!r.error.includes(String.fromCharCode(0x2014)));
});

t("who may manage drips: drips.manage, never a firm login, never nobody", () => {
  assert.equal(mayManageDrips(user("owner")), true);
  assert.equal(mayManageDrips(user("admin")), true);
  assert.equal(mayManageDrips(user("manager")), true);
  assert.equal(mayManageDrips(user("agent")), false);
  assert.equal(mayManageDrips(user("qa")), false);
  assert.equal(mayManageDrips(user("agent", { "drips.manage": true })), true);
  assert.equal(mayManageDrips(user("manager", { "drips.manage": false })), false);
  assert.equal(mayManageDrips(user("firm", { "drips.manage": true })), false);
  // gateUser returns null for a deactivated account.
  assert.equal(mayManageDrips(null), false);
});

t("the route's gate: a deactivated manager resolves to nobody, an active one keeps drips.manage", async () => {
  const fakeSb = (active: boolean) => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "u1", role: "manager", perm_overrides: {}, firm_id: "f", full_name: "M", active }, error: null }) }) }) }),
  });
  assert.equal(await gateUser(fakeSb(false)), null);
  assert.equal(mayManageDrips(await gateUser(fakeSb(false))), false);
  assert.equal(mayManageDrips(await gateUser(fakeSb(true))), true);
});

t("enroll: a deactivated or signed-out caller is refused before any read or write", async () => {
  const sb = session({ id: LEAD, firm_id: "firm-tmp" }), admin = service();
  const r = await enrollLeadInDrips(sb, admin, null, LEAD);
  assert.equal(r.status, 401);
  assert.equal(sb.calls.length + admin.rpcs.length, 0);
});

t("enroll: an agent without drips.manage is refused before any read or write", async () => {
  const sb = session({ id: LEAD, firm_id: "firm-tmp" }), admin = service();
  const r = await enrollLeadInDrips(sb, admin, user("agent"), LEAD);
  assert.equal(r.status, 403);
  assert.equal(sb.calls.length + admin.rpcs.length, 0);
});

t("enroll: a lead the caller cannot see through their own session is not found, and nothing is written", async () => {
  const sb = session(null), admin = service();
  const r = await enrollLeadInDrips(sb, admin, user("manager"), LEAD);
  assert.equal(r.status, 404);
  assert.equal(sb.calls.length, 1);
  assert.equal(admin.rpcs.length, 0);
});

t("enroll: a failed visibility check is a real error, and nothing is written", async () => {
  const sb = session(null, "JWT expired"), admin = service();
  const r = await enrollLeadInDrips(sb, admin, user("manager"), LEAD);
  assert.equal(r.status, 500);
  assert.match(r.body.error, /JWT expired/);
  assert.equal(admin.rpcs.length, 0);
});

t("enroll: a malformed lead id is refused", async () => {
  const sb = session(null), admin = service();
  assert.equal((await enrollLeadInDrips(sb, admin, user("owner"), "not-a-uuid")).status, 400);
  assert.equal((await enrollLeadInDrips(sb, admin, user("owner"), undefined)).status, 400);
  assert.equal(sb.calls.length + admin.rpcs.length, 0);
});

t("enroll: a visible lead enrolls under ITS OWN firm", async () => {
  const sb = session({ id: LEAD, firm_id: "firm-tmp" }), admin = service();
  const r = await enrollLeadInDrips(sb, admin, user("manager"), LEAD);
  assert.equal(r.status, 200);
  assert.deepEqual(admin.rpcs, [{ name: "enroll_drips_for_lead", args: { p_lead: LEAD, p_firm: "firm-tmp" } }]);
});

t("enroll: an RPC failure is reported, never a blind ok", async () => {
  const sb = session({ id: LEAD, firm_id: "firm-tmp" }), admin = service("rule missing");
  const r = await enrollLeadInDrips(sb, admin, user("owner"), LEAD);
  assert.equal(r.status, 500);
  assert.match(r.body.error, /Enrollment failed: rule missing/);
});

(async () => {
  for (const { name, fn } of tests) { await fn(); passed++; console.log("ok", name); }
  console.log(passed, "passed");
})().catch((e) => { console.error(e); process.exit(1); });
