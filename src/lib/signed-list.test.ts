import assert from "node:assert/strict";
import { isSignedClient } from "./signed-list";

const empty = new Set<string>();
assert.equal(isSignedClient({ id: "motel", signed_at: null, claims: [{ status: "delivered" }] }, null, empty), false);
assert.equal(isSignedClient({ id: "ariana", signed_at: "2026-09-28T23:49:44Z", claims: [{ status: "signed_grievous" }] }, null, empty), true);
assert.equal(isSignedClient({ id: "niko", signed_at: null, claims: [{ status: "signed_grievous" }] }, null, new Set(["niko"])), true);
assert.equal(isSignedClient({ id: "pending", signed_at: null, claims: [{ status: "esign_sent" }] }, null, new Set(["pending"])), false);
console.log("signed list requires signed status plus signature evidence");

