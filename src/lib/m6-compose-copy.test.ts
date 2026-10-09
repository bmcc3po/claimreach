// Compose copy. Run: npx tsx src/lib/m6-compose-copy.test.ts
import {
  composeIntroHint, composeLiveReady, composeResultCopy,
} from "./m6-compose-copy";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log("\nM6 COMPOSE COPY");
const both = { justcall: true, resend: true };
const justcallOnly = { justcall: true, resend: false };
const resendOnly = { justcall: false, resend: true };
const neither = { justcall: false, resend: false };

check("SMS is live when JustCall is up, even without Resend", composeLiveReady("sms", justcallOnly), true);
check("email is not live without Resend", composeLiveReady("email", justcallOnly), false);
check("email is live when Resend is up, even without JustCall", composeLiveReady("email", resendOnly), true);
check("SMS is not live without JustCall", composeLiveReady("sms", resendOnly), false);
check("neither rail is not live", composeLiveReady("sms", neither), false);
check("letter has no live send", composeLiveReady("letter", both), false);

const liveHint = composeIntroHint(justcallOnly, "sms");
check("live SMS hint does not mention missing keys", liveHint.includes("JustCall") || liveHint.includes("Resend") || liveHint.includes("Josh"), false);
check("live SMS hint offers send", liveHint.includes("send"), true);

const missingJc = composeIntroHint(neither, "sms");
check("missing JustCall names JustCall", missingJc.includes("JustCall"), true);
check("missing JustCall does not mention Josh", missingJc.includes("Josh"), false);

const missingResend = composeIntroHint(justcallOnly, "email");
check("missing Resend names Resend only", missingResend.includes("Resend") && !missingResend.includes("JustCall") && !missingResend.includes("Josh"), true);

check("sent copy", composeResultCopy({ ok: true, live: true, send_status: "sent" }), { ok: "Sent." });
check("logged copy does not hold live send hostage", composeResultCopy({ ok: true, live: false, send_status: "logged" }), { ok: "Logged to the timeline." });
check("JustCall error from POST", composeResultCopy({ error: "number is invalid" }), { err: "number is invalid" });
check("quiet hours from POST", composeResultCopy({
  ok: true, send_status: "blocked", gates: { messages: ["Quiet hours. Try after 8am in their time zone."] },
}), { err: "Quiet hours. Try after 8am in their time zone." });
check("opt-out from POST", composeResultCopy({
  error: "This person opted out. Do not send.",
}), { err: "This person opted out. Do not send." });

for (const result of [null, undefined, {}, { ok: false, send_status: 'sent', live: true }, { ok: true }, { ok: true, live: true, send_status: 'logged' }]) {
  check('unconfirmed response never reports saved or sent', !!composeResultCopy(result).err, true);
}
check('confirmed duplicate is explicit', composeResultCopy({ok:true,duplicate:true}),{ok:'Already on the timeline. Not sent twice.'});

if (fail) { console.log(`\n${fail} failed, ${pass} passed`); process.exit(1); }
console.log(`\n${pass} passed`);
