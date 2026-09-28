// npx tsx src/lib/matter.test.ts
import assert from "node:assert/strict";
import { resolveMatter, matterRowsFilter, rowBelongsToMatter } from "./matter";

let pass = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); pass++; console.log("ok", name); };

// A tiny fake of the supabase query builder: claims only.
function fakeDb(claims: any[], opts: { fail?: boolean } = {}) {
  return {
    from(table: string) {
      assert.equal(table, "claims");
      const f: any = { rows: claims.slice(), head: false, count: false };
      const q: any = {
        select(_c: string, o?: any) { if (o?.head) { f.head = true; f.count = true; } return q; },
        eq(k: string, v: any) { f.rows = f.rows.filter((r: any) => r[k] === v); return q; },
        order() { return q; },
        maybeSingle: async () => (opts.fail ? { data: null, error: { message: "boom" } } : { data: f.rows[0] ?? null, error: null }),
        then(res: any, rej: any) {
          const out = opts.fail ? { data: null, error: { message: "boom" }, count: null } : f.head ? { data: null, error: null, count: f.rows.length } : { data: f.rows, error: null };
          return Promise.resolve(out).then(res, rej);
        },
      };
      return q;
    },
  };
}
const C = (id: string, lead: string, camp: string | null) => ({ id, lead_id: lead, firm_id: "F", campaign_id: camp, campaign: camp, claim_type: "mva", status: "new", answers: {}, created_at: id });

(async () => {
  await t("a named sole claim is sole (disposition may use its own legacy signature)", async () => {
    const m = await resolveMatter(fakeDb([C("a", "L", "mva")]), "L", { claimId: "a" });
    assert.ok(m.ok && m.via === "named" && m.sole === true);
  });
  await t("a named claim among siblings is not sole", async () => {
    const m = await resolveMatter(fakeDb([C("a", "L", "mva"), C("b", "L", "motel")]), "L", { claimId: "a" });
    assert.ok(m.ok && m.via === "named" && m.sole === false);
  });
  await t("a campaign match among siblings is not sole", async () => {
    const m = await resolveMatter(fakeDb([C("a", "L", "mva"), C("b", "L", "motel")]), "L", { campaignId: "mva" });
    assert.ok(m.ok && m.via === "campaign" && m.sole === false);
  });
  await t("ambiguous and failed lookups stop", async () => {
    const m1 = await resolveMatter(fakeDb([C("a", "L", "mva"), C("b", "L", "mva")]), "L", { campaignId: "mva" });
    assert.ok(!m1.ok && m1.ambiguous);
    const m2 = await resolveMatter(fakeDb([C("a", "L", "mva")], { fail: true }), "L", {});
    assert.ok(!m2.ok && m2.status === 500);
  });
  await t("rows filter: null claim is a wildcard only for a sole matter on a compatible campaign", () => {
    const sole = { claim: { id: "a", campaign_id: "c1" }, sole: true };
    const many = { claim: { id: "a", campaign_id: "c1" }, sole: false };
    assert.equal(matterRowsFilter(many), "claim_id.eq.a");
    assert.equal(matterRowsFilter(sole), "claim_id.eq.a,and(claim_id.is.null,or(campaign_id.is.null,campaign_id.eq.c1))");
    assert.equal(rowBelongsToMatter({ claim_id: null, campaign_id: "c1" }, sole), true);
    assert.equal(rowBelongsToMatter({ claim_id: null, campaign_id: "c2" }, sole), false);
    assert.equal(rowBelongsToMatter({ claim_id: null, campaign_id: "c1" }, many), false);
    assert.equal(rowBelongsToMatter({ claim_id: "b", campaign_id: "c1" }, sole), false);
    assert.equal(rowBelongsToMatter({ claim_id: "a" }, many), true);
  });
  console.log(`${pass} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
