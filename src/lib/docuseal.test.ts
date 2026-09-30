// Run: npx tsx src/lib/docuseal.test.ts
// The DocuSeal requests, checked against what DocuSeal actually answered in a
// test-mode run (templates 6079413/6079423/6079424, submission 11623733).
import assert from "node:assert/strict";
import { templateBody, submissionBody, createSubmission, createTemplate, getSubmissionDocuments, expireSubmission, plainDocuSeal, templateProblem, statusFrom } from "./docuseal";
import { TMP_MVA_PACKETS } from "./esign-packets/tmp-mva";
import { templateFor } from "./mva-call/esign";

let passed = 0;
async function t(name: string, fn: () => void | Promise<void>) { await fn(); passed++; console.log("ok", name); }
(globalThis as any).process.env.DOCUSEAL_API_KEY = "test-key";

const values = { "Client Name": "Qa Tester", "Injured Party Name": "Qa Tester", "Signing Date": "09/27/2026", "Accident Date": "09/20/2026" };

function fakeFetch(answer: { status: number; body: any }, seen: any[]) {
  return (async (url: string, init: any) => {
    seen.push({ url, method: init?.method || "GET", body: init?.body ? JSON.parse(init.body) : null, headers: init?.headers });
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
}

(async () => {
  await t("the template request puts the fields inside the document (the live bug)", () => {
    for (const [key, p] of Object.entries(TMP_MVA_PACKETS)) {
      const b: any = templateBody(p, "https://claimreach.com" + p.path);
      assert.equal(b.fields, undefined, `${key}: no top-level fields`);
      assert.equal(b.documents.length, 1);
      assert.equal(b.documents[0].file, "https://claimreach.com" + p.path);
      assert.equal(b.documents[0].fields.length, 8, `${key}: 8 fields`);
      const roles = new Set(b.documents[0].fields.map((f: any) => f.role));
      assert.deepEqual([...roles].sort(), ["Client", "Intake"]);
      for (const f of b.documents[0].fields) for (const a of f.areas) {
        // Nevada's contract runs 4 pages before the 3 HIPAA pages (7 in all).
        const last = key.startsWith("NV") ? 7 : 6;
        assert.ok(a.page >= 1 && a.page <= last, `${key} ${f.name}: page ${a.page}`);
        for (const n of [a.x, a.y, a.w, a.h]) assert.ok(n > 0 && n < 1, `${key} ${f.name}: area inside the page`);
        assert.ok(a.x + a.w <= 1 && a.y + a.h <= 1, `${key} ${f.name}: area fits`);
      }
    }
  });

  await t("packets are v3 so the empty v2 templates are replaced on the next send", () => {
    // TX, FL and OTHER went to v3 to replace the empty v2 templates. The two
    // Nevada packets were born correct as v1 (Sep 28).
    for (const [k, p] of Object.entries(TMP_MVA_PACKETS)) {
      const ver = k.startsWith("NV") ? "v1" : "v3";
      assert.match(p.name, new RegExp(` ${ver}$`)); assert.match(p.external_id, new RegExp(`-${ver}$`));
    }
  });

  await t("the send request: client first, intake second, no made-up params", () => {
    const b: any = submissionBody({ templateId: "6079423", client: { name: "Qa Tester", phone: "+12055550142", values }, intake: { email: "a@b.com", name: "Brett" }, emailClient: false, externalId: "lead-1" });
    assert.equal(b.template_id, 6079423);
    assert.equal(b.order, "preserved");
    assert.deepEqual(b.submitters.map((s: any) => s.role), ["Client", "Intake"]);
    const c = b.submitters[0];
    assert.equal(c.readonly_fields, undefined);
    assert.equal(c.email, undefined, "no email key on a text send without one");
    assert.equal(c.phone, "+12055550142");
    assert.equal(c.send_email, false);
    assert.equal(c.send_sms, false);
    assert.equal(b.submitters[1].send_email, false);
  });

  await t("every locked client field on every agreement gets a value from the send", () => {
    for (const p of Object.values(TMP_MVA_PACKETS)) {
      const locked = p.fields.filter((f) => f.role === "Client" && f.readonly).map((f) => f.name).sort();
      assert.deepEqual(locked, Object.keys(values).sort());
    }
  });

  await t("early identity fills Intake fields without completing either signer or requesting an office signature", () => {
    const intakeValues = { "Patient DOB": "01/01/1990", "Patient SSN": "000-00-0000" };
    const b: any = submissionBody({ templateId: 1, client: { name: "Synthetic Tester", values }, intake: { email: "test@example.com", values: intakeValues }, emailClient: false });
    assert.deepEqual(b.submitters[1].values, intakeValues);
    assert.equal(b.submitters[0].values["Patient SSN"], undefined);
    assert.equal(b.submitters[1].send_email, false);
    assert.equal(b.submitters[1].send_sms, false);
    assert.equal(b.submitters.some((s: any) => s.completed === true), false);
    assert.equal(b.order, "preserved");
    const without: any = submissionBody({ templateId: 1, client: { name: "Synthetic Tester", values }, intake: { email: "test@example.com" }, emailClient: false });
    assert.equal(without.submitters[1].values, undefined, "collecting identity later remains supported");
  });

  await t("an email send lets DocuSeal email her", () => {
    const b: any = submissionBody({ templateId: 1, client: { name: "Q", email: "q@example.com", phone: null, values }, intake: { email: "a@b.com" }, emailClient: true });
    assert.equal(b.send_email, true);
    assert.equal(b.submitters[0].send_email, true);
    assert.equal(b.submitters[0].email, "q@example.com");
    assert.equal(b.submitters[0].phone, undefined);
  });

  await t("createSubmission posts exactly that body and reads DocuSeal's real answer", async () => {
    const seen: any[] = [];
    // Trimmed from DocuSeal's answer to the test-mode text send.
    const answer = [
      { id: 15047641, submission_id: 11623733, role: "Client", status: "awaiting", phone: "+12055550142", embed_src: "https://docuseal.com/s/KApt7Gwezv81iC" },
      { id: 15047642, submission_id: 11623733, role: "Intake", status: "awaiting", embed_src: "https://docuseal.com/s/4bQvGKvwFhpa8J" },
    ];
    const opts = { templateId: "6079423", client: { name: "Qa Tester", phone: "+12055550142", values }, intake: { email: "a@b.com", name: "Brett" }, emailClient: false };
    const r = await createSubmission(opts, fakeFetch({ status: 200, body: answer }, seen));
    assert.equal(seen[0].url, "https://api.docuseal.com/submissions");
    assert.equal(seen[0].method, "POST");
    assert.equal(seen[0].headers["X-Auth-Token"], "test-key");
    assert.deepEqual(seen[0].body, submissionBody(opts));
    assert.ok(r.ok);
    const client = (r as any).data.find((s: any) => s.role === "Client");
    assert.equal(client.embed_src, "https://docuseal.com/s/KApt7Gwezv81iC");
    assert.equal(client.submission_id, 11623733);
  });

  await t("createTemplate posts the nested body", async () => {
    const seen: any[] = [];
    const p = TMP_MVA_PACKETS.TX;
    await createTemplate(p, "https://x/y.pdf", fakeFetch({ status: 200, body: { id: 1, fields: p.fields } }, seen));
    assert.equal(seen[0].url, "https://api.docuseal.com/templates/pdf");
    assert.deepEqual(seen[0].body, templateBody(p, "https://x/y.pdf"));
  });

  await t("client-signed preview asks DocuSeal for a fresh merged partial PDF", async () => {
    const seen: any[] = [];
    const r = await getSubmissionDocuments(117, fakeFetch({ status: 200, body: { id: 117, documents: [{ name: "packet", url: "https://docuseal.com/file/synthetic.pdf" }] } }, seen));
    assert.equal(seen[0].url, "https://api.docuseal.com/submissions/117/documents?merge=true");
    assert.equal(seen[0].method, "GET");
    assert.ok(r.ok);
  });

  await t("unsigned replacement expires the old DocuSeal signer link", async () => {
    const seen: any[] = []; const at = "2026-09-29T17:00:00.000Z";
    await expireSubmission(117, at, fakeFetch({ status: 200, body: { id: 117, expire_at: at } }, seen));
    assert.equal(seen[0].url, "https://api.docuseal.com/submissions/117");
    assert.equal(seen[0].method, "PUT");
    assert.deepEqual(seen[0].body, { expire_at: at });
  });

  await t("DocuSeal's real refusals become plain words and the right fix", () => {
    assert.match(plainDocuSeal("Not authenticated", 401, "send"), /refused our key.*DOCUSEAL_API_KEY/);
    assert.equal(templateProblem("Template does not contain fields", 422), true);
    assert.equal(templateProblem("DocuSeal said 404.", 404), true);
    assert.equal(templateProblem("Phone is invalid", 422), false);
    for (const status of [undefined, 500, 502, 504]) {
      const message = plainDocuSeal("Could not reach DocuSeal.", status, "send");
      assert.match(message, /did not confirm.*Do not send another agreement/);
      assert.doesNotMatch(message, /Nothing was sent|press Send again/);
    }
    assert.match(plainDocuSeal("Phone is invalid", 422, "send"), /cell number is not valid/);
    assert.match(plainDocuSeal("Email is invalid", 422, "send"), /email is not valid/);
    assert.match(plainDocuSeal("Too many requests", 429, "send"), /busy/);
    for (const m of [plainDocuSeal("x", 422, "send"), plainDocuSeal("x", 422, "template"), plainDocuSeal("Not authenticated", 401, "template")]) {
      assert.match(m, /Nothing was sent/);
      assert.doesNotMatch(m, /[—·]/, "no em dashes or middots");
    }
  });

  await t("status reads DocuSeal's answer after she signs and after we complete", () => {
    assert.equal(statusFrom({ status: "pending", submitters: [{ id: 2, role: "Intake", status: "awaiting" }, { id: 1, role: "Client", status: "completed", completed_at: "2026-09-27T22:51:32Z" }] }), "signed");
    assert.equal(statusFrom({ status: "completed", submitters: [] }), "completed");
    assert.equal(statusFrom({ status: "expired", submitters: [{ id: 1, role: "Client", completed_at: "2026-09-29T12:00:00Z", status: "completed" }] }), "signed");
    assert.equal(statusFrom({ status: "expired", submitters: [{ id: 1, role: "Client", completed_at: "2026-09-29T12:00:00Z", status: "declined" }] }), "signed");
    assert.equal(statusFrom({ status: "expired", submitters: [{ id: 1, role: "Client", status: "awaiting" }] }), "expired");
    assert.equal(statusFrom({ status: "pending", submitters: [{ id: 1, role: "Client", status: "awaiting" }] }), "sent");
  });

  // templateFor with a stand-in database and DocuSeal.
  function fakeAdmin(row: any) {
    const writes: any[] = [];
    const q: any = {
      select: () => q, eq: () => q, maybeSingle: async () => ({ data: row }),
      update: (v: any) => { writes.push({ update: v }); return q; },
      insert: (v: any) => { writes.push({ insert: v }); return Promise.resolve({ error: null }); },
      then: (res: any) => res({ error: null }),
    };
    return { admin: { from: (tbl: string) => (tbl === "audit_log" ? { insert: async () => ({ error: null }) } : q) }, writes };
  }
  const realFetch = globalThis.fetch;
  const withFetch = async (answer: { status: number; body: any }, fn: (seen: any[]) => Promise<void>) => {
    const seen: any[] = [];
    (globalThis as any).fetch = fakeFetch(answer, seen);
    try { await fn(seen); } finally { (globalThis as any).fetch = realFetch; }
  };
  const base = { firmId: "f", campaignId: "c", key: "OTHER", packet: TMP_MVA_PACKETS.OTHER, origin: "https://claimreach.com" };

  await t("a stored v2 template is replaced by a new v3 one with its fields", async () => {
    const { admin, writes } = fakeAdmin({ template_id: "6079376", name: "TMP MVA Retainer + HIPAA/HITECH - All other states (AL/GA form) v2" });
    await withFetch({ status: 200, body: { id: 7000001, fields: TMP_MVA_PACKETS.OTHER.fields } }, async (seen) => {
      const r = await templateFor(admin, base);
      assert.deepEqual(r, { ok: true, templateId: "7000001", made: true });
      assert.equal(seen[0].body.documents[0].fields.length, 8);
      assert.equal(writes[0].update.template_id, "7000001");
    });
  });

  await t("a template DocuSeal makes without its boxes is never stored", async () => {
    const { admin, writes } = fakeAdmin({ template_id: "6079376", name: "old v2" });
    await withFetch({ status: 200, body: { id: 7000002, fields: [] } }, async () => {
      const r = await templateFor(admin, base);
      assert.equal(r.ok, false);
      assert.match((r as any).error, /without all its signing boxes \(0 of 8\)\. Nothing was sent/);
      assert.equal(writes.length, 0);
    });
  });

  await t("a current template is reused, and force makes it new", async () => {
    const { admin } = fakeAdmin({ template_id: "6079413", name: TMP_MVA_PACKETS.OTHER.name });
    await withFetch({ status: 200, body: { id: 7000003, fields: TMP_MVA_PACKETS.OTHER.fields } }, async (seen) => {
      assert.deepEqual(await templateFor(admin, base), { ok: true, templateId: "6079413", made: false });
      assert.equal(seen.length, 0);
      assert.deepEqual(await templateFor(admin, { ...base, force: true }), { ok: true, templateId: "7000003", made: true });
    });
  });

  console.log(`\n${passed} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
