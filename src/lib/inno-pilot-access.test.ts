import assert from "node:assert/strict";
import { pilotStaffApiAllowed, pilotStaffPageAllowed } from "./inno-pilot-access";

for (const path of ["/dashboard", "/queue", "/app", "/app/TMP-1219"]) {
  assert.equal(pilotStaffPageAllowed(path), true, path);
}
for (const path of ["/leads", "/leads/TMT-1034", "/settings", "/signed", "/board", "/calls/TMT-1034"]) {
  assert.equal(pilotStaffPageAllowed(path), false, path);
}
for (const path of ["/api/calls/search", "/api/calls/file", "/api/calls/esign/resend", "/api/leads", "/api/firm-delivery"]) {
  assert.equal(pilotStaffApiAllowed(path), true, path);
}
for (const path of ["/api/calls/esign-setup", "/api/export", "/api/console", "/api/campaigns", "/api/users"]) {
  assert.equal(pilotStaffApiAllowed(path), false, path);
}
console.log("pilot route fence passed");
