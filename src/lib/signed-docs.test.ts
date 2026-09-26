// Signed-docs access rule + path/link shape. Run: npx tsx src/lib/signed-docs.test.ts
import {
  mayOpenSignedDoc, signedDocPath, signedDocLink, isSignedKind, SIGNER_WINDOW_HOURS,
} from "./signed-docs";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

const TMP = "firm-tmp", TMT = "firm-tmt";
const now = Date.parse("2026-09-26T12:00:00Z");
const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString();

console.log("\nSTAFF");
check("agent opens any firm's file", mayOpenSignedDoc({ user: { role: "agent", firmId: null }, internal: true, docFirmId: TMP, signedAt: hoursAgo(500), now }), true);
check("qa opens any firm's file", mayOpenSignedDoc({ user: { role: "qa", firmId: null }, internal: true, docFirmId: TMT, signedAt: null, now }), true);

console.log("\nFIRM USERS (tenant fence)");
check("TMP user opens TMP file", mayOpenSignedDoc({ user: { role: "firm", firmId: TMP }, internal: false, docFirmId: TMP, signedAt: hoursAgo(500), now }), true);
check("TMP user blocked from TMT file", mayOpenSignedDoc({ user: { role: "firm", firmId: TMP }, internal: false, docFirmId: TMT, signedAt: hoursAgo(1), now }), false);
check("firm user with no firm blocked", mayOpenSignedDoc({ user: { role: "firm", firmId: null }, internal: false, docFirmId: TMP, signedAt: hoursAgo(1), now }), false);
check("firm user blocked from firmless file", mayOpenSignedDoc({ user: { role: "firm", firmId: TMP }, internal: false, docFirmId: null, signedAt: hoursAgo(1), now }), false);
check("logged-in firm user does not get the signer window", mayOpenSignedDoc({ user: { role: "firm", firmId: TMT }, internal: false, docFirmId: TMP, signedAt: hoursAgo(0.1), now }), false);

console.log("\nSIGNER (no login)");
check("signer inside window", mayOpenSignedDoc({ user: null, internal: false, docFirmId: TMP, signedAt: hoursAgo(1), now }), true);
check("signer at window edge", mayOpenSignedDoc({ user: null, internal: false, docFirmId: TMP, signedAt: hoursAgo(SIGNER_WINDOW_HOURS), now }), true);
check("signer after window", mayOpenSignedDoc({ user: null, internal: false, docFirmId: TMP, signedAt: hoursAgo(SIGNER_WINDOW_HOURS + 0.01), now }), false);
check("unsigned doc never public", mayOpenSignedDoc({ user: null, internal: false, docFirmId: TMP, signedAt: null, now }), false);
check("garbage date never public", mayOpenSignedDoc({ user: null, internal: false, docFirmId: TMP, signedAt: "nope", now }), false);
check("future signed_at never public", mayOpenSignedDoc({ user: null, internal: false, docFirmId: TMP, signedAt: hoursAgo(-2), now }), false);

console.log("\nPATHS + LINKS");
check("signed path keeps old layout", signedDocPath(TMP, "CR-ABC123", "signed"), "firm-tmp/signed-CR-ABC123.pdf");
check("cert path keeps old layout", signedDocPath(null, "CR-ABC123", "cert"), "master/cert-CR-ABC123.pdf");
check("link is the gated route", signedDocLink("abc", "signed"), "/api/signed-doc/abc/signed");
check("kind guard", [isSignedKind("signed"), isSignedKind("cert"), isSignedKind("x"), isSignedKind(null)], [true, true, false, false]);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
