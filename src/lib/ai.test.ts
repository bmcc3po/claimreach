// Crissi live/offline. Run: npx tsx src/lib/ai.test.ts
import { crissiBrainFromHealth } from "./ai";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log("\nCRISSI BRAIN FROM HEALTH");
check("direct answer is live", crissiBrainFromHealth({ direct: { answer: "OK" }, viaProxy: { answer: "" } }), "live");
check("proxy answer is live", crissiBrainFromHealth({ direct: { answer: "" }, viaProxy: { answer: "OK" } }), "live");
check("tonight: HTTP 200 + empty answers is offline", crissiBrainFromHealth({
  direct: { answer: "", error: "relay_530" },
  viaProxy: { answer: "" },
}), "offline");
check("missing answers is offline", crissiBrainFromHealth({}), "offline");
check("whitespace is not an answer", crissiBrainFromHealth({ direct: { answer: "   " }, viaProxy: { answer: "" } }), "offline");
check("null payload is offline", crissiBrainFromHealth(null), "offline");

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log(`\n${pass} passed`);
