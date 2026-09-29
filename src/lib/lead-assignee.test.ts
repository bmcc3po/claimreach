import assert from "node:assert/strict";
import { resolveLawRulerAssignee } from "./lead-ingest";

async function main() {
  const users = [
    { id: "lisa", email: "lisa@innovativeintake.com", full_name: "Lisa Baul", active: true, role: "agent" },
    { id: "former", email: "former@example.com", full_name: "Former Agent", active: false, role: "agent" },
  ];
  const admin = { from: () => ({ select: () => ({ eq: async () => ({ data: users.filter(u => u.active), error: null }) }) }) };
  assert.equal(await resolveLawRulerAssignee(admin, "Lisa Baul"), "lisa");
  assert.equal(await resolveLawRulerAssignee(admin, "former@example.com"), null);
  assert.equal(await resolveLawRulerAssignee(admin, "Unknown Person"), null);
  console.log("LawRuler assignee resolution passed");
}

main().catch(e => { console.error(e); process.exitCode = 1; });
