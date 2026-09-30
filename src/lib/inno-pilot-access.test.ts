import assert from "node:assert/strict";
import { pilotStaffApiAllowed, pilotStaffPageAllowed } from "./inno-pilot-access";

for (const path of ["/dashboard", "/queue", "/app", "/app/TMP-1219", "/set-password"]) {
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
assert.equal(pilotStaffApiAllowed("/api/case/details", "POST"), true);
for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE"])
  assert.equal(pilotStaffApiAllowed("/api/case/details", method), false);
console.log("pilot case-details write is an exact POST exception");
for (const path of ["/api/statuses", "/api/dq-reasons"]) {
  for (const method of ["GET", "HEAD"]) assert.equal(pilotStaffApiAllowed(path, method), true);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(pilotStaffApiAllowed(path, method), false);
}
console.log("pilot status and DQ catalogs allow reads only");
assert.equal(pilotStaffApiAllowed("/api/me/password", "POST"), true);
for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE"]) assert.equal(pilotStaffApiAllowed("/api/me/password", method), false);
for (const path of ["/api/me/password/other", "/api/me/profile", "/api/me/password-reset"]) assert.equal(pilotStaffApiAllowed(path, "POST"), false);
assert.equal(pilotStaffPageAllowed("/set-password/other"), false);
console.log("pilot password change exception is exact and POST-only");

