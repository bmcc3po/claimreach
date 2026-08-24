// npx tsx src/lib/file-notes.test.ts
import { mergeFileNotes } from "./file-notes";

let pass = 0, fail = 0;
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
}

console.log("\nFILE NOTES — one thread");
const merged = mergeFileNotes(
  [{ id: "s1", body: "Staff note", created_at: "2026-01-02T00:00:00Z", author_name: "Ava", scope: "call" }],
  [{ id: "d1", body: "Desk note", created_at: "2026-01-03T00:00:00Z", author: "u1", source: "m6" }],
  new Map([["u1", "Crissi desk"]]),
);
check("newer desk note first", merged[0].id, "d1");
check("desk keeps file scope", merged[0].scope, "file");
check("desk name resolved", merged[0].author_name, "Crissi desk");
check("staff note still there", merged[1].id, "s1");
check("empty both is empty", mergeFileNotes([], [], new Map()).length, 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
