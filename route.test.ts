import { routeCall, resolveRoute, attemptsRemaining, type RoutingRule } from "./src/lib/intake-console/routing";
let pass=0, fail=0;
const ck=(n:string,g:any,w:any)=>{const o=JSON.stringify(g)===JSON.stringify(w);o?(pass++,console.log(`  ok   ${n}`)):(fail++,console.log(`  FAIL ${n}\n       got ${JSON.stringify(g)} want ${JSON.stringify(w)}`));};
const O=(d:string,reason="x")=>({disposition:d,reason,flags:[],closeKey:"x"} as any);

const RULES: RoutingRule[] = [
  { state: null, case_type: null, destination_type: "live_transfer", destination_name: "TMT intake line", transfer_number: "702-555-0100", attempts_required: 2, fallback_emails: ["intake@tmt.com"] },
  { state: "CA", case_type: null, destination_type: "live_transfer", destination_name: "Acme Law", transfer_number: "619-555-1212", attempts_required: 2, fallback_emails: ["intake@acme.com","ops@acme.com"] },
  { state: "CA", case_type: "prem", destination_type: "network", destination_name: "the Lexamica network" },
  { state: "TX", case_type: null, destination_type: "network", destination_name: "the Lexamica network" },
];

console.log("\nMOST SPECIFIC RULE WINS");
ck("California auto goes to Acme", resolveRoute(RULES,"CA","mva")?.destination_name, "Acme Law");
ck("California premises goes to the network instead", resolveRoute(RULES,"CA","prem")?.destination_type, "network");
ck("Texas goes to the network on any type", resolveRoute(RULES,"TX","mva")?.destination_type, "network");
ck("a state with no rule falls to the catch-all", resolveRoute(RULES,"NV","mva")?.destination_name, "TMT intake line");
ck("nothing configured returns null, it does not guess", resolveRoute([],"CA","mva"), null);

console.log("\nTHE TWO ATTEMPT RULE");
const ca = resolveRoute(RULES,"CA","mva")!;
ck("two required at the start", attemptsRemaining(ca, []), 2);
ck("one left after the first", attemptsRemaining(ca, [{at:"t1"}]), 1);
ck("none left after the second", attemptsRemaining(ca, [{at:"t1"},{at:"t2"}]), 0);

const first = routeCall(O("SIGN"), { path:"transfer", rule: ca, attempts: [] });
ck("the agent is told the firm and the number", first.destination, "Acme Law . 619-555-1212");
ck("no answer is not offered before an attempt is logged",
  first.statuses.some(s=>s.key==="transfer_no_answer"), false);
ck("logging an attempt is the second option", first.statuses[1].key, "__attempt");

const second = routeCall(O("SIGN"), { path:"transfer", rule: ca, attempts: [{at:"t1"}] });
ck("still not offered after only one", second.statuses[1].key, "__attempt");
ck("the agent is told where they are", second.note.includes("Attempt 1 of 2"), true);

const done = routeCall(O("SIGN"), { path:"transfer", rule: ca, attempts: [{at:"t1"},{at:"t2"}] });
ck("the email option opens after two", done.statuses[0].key, "__fallback");
ck("and it names the recipients", done.note.includes("intake@acme.com"), true);

console.log("\nA ROUTE WITH NO FALLBACK DOES NOT INVENT ONE");
const bare: RoutingRule = { destination_type:"live_transfer", destination_name:"Some Firm", attempts_required:2, fallback_emails:[] };
const noFb = routeCall(O("SIGN"), { path:"transfer", rule: bare, attempts:[{at:"1"},{at:"2"}] });
ck("no email button", noFb.statuses.some(s=>s.key==="__fallback"), false);
ck("it waits for a callback instead", noFb.statuses[0].key, "transfer_no_answer");

console.log("\nA MISSING RULE IS A SETUP GAP, NOT A GUESS");
const none = routeCall(O("SIGN"), { path:"transfer", rule: null });
ck("does not transfer", none.destination, null);
ck("gets a supervisor", none.action, "supervisor");

console.log("\nNETWORK ROUTES SKIP THE TRANSFER ENTIRELY");
const net = routeCall(O("SIGN"), { path:"transfer", rule: resolveRoute(RULES,"TX","mva")! });
ck("no transfer attempted", net.action, "network");
ck("status is network referred", net.statuses[0].key, "network_referred");

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
