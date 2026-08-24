// JustCall SMS helper. Run: npx tsx src/lib/justcall-send.test.ts
import {
  JUSTCALL_TEXTS_URL, MISSING_JUSTCALL_KEYS,
  formatFromNumber, resolveM6SmsDestination, sendJustCallSms, toE164,
} from "./justcall-send";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

async function run() {
  console.log("\nJUSTCALL SEND");
  check("10-digit to E.164", toE164("2562075828"), "+12562075828");
  check("already E.164", toE164("+12562075828"), "+12562075828");
  check("format from number", formatFromNumber("+12562075828"), "+1 256 207 5828");
  check("missing keys is plain English", await sendJustCallSms({
    to: "+15555550100", body: "hi", from: "+12562075828", apiKey: "", apiSecret: "",
  }), { ok: false, error: MISSING_JUSTCALL_KEYS });

  const dest = resolveM6SmsDestination({
    leadPhone: "6015550100",
    points: [
      { id: "a", kind: "email", value: "brettmichael@me.com", status: "opted_out" },
      { id: "b", kind: "mobile", value: "6015550100", status: "good" },
    ],
  });
  check("lead phone is the dest when live", dest.to, "+16015550100");
  check("opted-out email does not block a live phone", dest.optedOut, false);

  const optedPhone = resolveM6SmsDestination({
    leadPhone: "6015550100",
    points: [{ id: "p", kind: "mobile", value: "+16015550100", status: "opted_out" }],
  });
  check("opted-out dest is a hard gate", optedPhone.optedOut, true);

  let called: { url: string; auth: string | null; body: any } | null = null;
  const sent = await sendJustCallSms({
    to: "6015550100",
    body: "Hi Ada, still your best number?",
    from: "+12562075828",
    apiKey: "k",
    apiSecret: "s",
    fetchImpl: (async (url, init) => {
      called = {
        url: String(url),
        auth: (init?.headers as any)?.Authorization ?? null,
        body: JSON.parse(String(init?.body ?? "{}")),
      };
      return new Response(JSON.stringify({ id: "jc_1" }), { status: 200 });
    }) as typeof fetch,
  });
  check("2xx is sent", sent.ok, true);
  check("posts texts/new", called?.url, JUSTCALL_TEXTS_URL);
  check("raw key:secret auth", called?.auth, "k:s");
  check("from is the M6 line", called?.body?.justcall_number, "+12562075828");
  check("to is E.164", called?.body?.contact_number, "+16015550100");
  check("body is the agent text", called?.body?.body, "Hi Ada, still your best number?");

  const failed = await sendJustCallSms({
    to: "6015550100",
    body: "hi",
    from: "+12562075828",
    apiKey: "k",
    apiSecret: "s",
    fetchImpl: (async () => new Response(JSON.stringify({ message: "number is invalid" }), { status: 400 })) as typeof fetch,
  });
  check("JustCall error is plain", failed, { ok: false, error: "number is invalid" });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail) process.exit(1);
}

run();
