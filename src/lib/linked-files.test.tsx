import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { linkedFilesFor, passengerFileLinks } from "./linked-files";
import PassengerAgreement from "../components/calls/PassengerAgreement";

const parent = "10000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const rows = [
  { id: parent, firm_id: "firm-a", external_id: null, claimant_name: "TEST Driver" },
  { id: "child-one", firm_id: "firm-a", external_id: `${parent}:pax:stable-one`, claimant_name: "Same TEST name" },
  { id: "child-two", firm_id: "firm-a", external_id: `${parent}:pax:stable-two`, claimant_name: "Same TEST name" },
  { id: "legacy", firm_id: "firm-a", external_id: `${parent}:pax:0`, claimant_name: "Legacy TEST" },
  { id: "archived", firm_id: "firm-a", external_id: `${parent}:pax:archived`, archived_at: "2026-10-01", claimant_name: "Archived TEST" },
  { id: "foreign", firm_id: "firm-b", external_id: `${parent}:pax:foreign`, claimant_name: "Foreign TEST" },
  { id: "another-parent", firm_id: "firm-a", external_id: `${other}:pax:stable-one`, claimant_name: "Other TEST" },
];
const queries: Array<Array<[string, unknown]>> = [];
const db = { from(table: string) {
  assert.equal(table, "leads");
  let result = [...rows];
  const filters: Array<[string, unknown]> = [];
  queries.push(filters);
  return {
    select() { return this; },
    eq(key: string, value: unknown) { filters.push([key, value]); result = result.filter(row => (row as any)[key] === value); return this; },
    like(key: string, value: string) { result = result.filter(row => String((row as any)[key] || "").startsWith(value.slice(0, -1))); return this; },
    is(key: string, value: unknown) { result = result.filter(row => ((row as any)[key] ?? null) === value); return this; },
    limit(n: number) { return Promise.resolve({ data: result.slice(0, n) }); },
    maybeSingle() { return Promise.resolve({ data: result[0] ?? null }); },
  };
} };

async function main() {
  const linked = await linkedFilesFor(db, { id: parent, firm_id: "firm-a" });
  // A fresh page load can reconstruct both links despite equal names and a
  // different server row order; it needs no send response in local state.
  const restored = passengerFileLinks([...linked].reverse());
  assert.deepEqual(restored, { "0": "legacy", "stable-two": "child-two", "stable-one": "child-one" });
  for (const key of ["stable-one", "stable-two"] as const) {
    const html = renderToStaticMarkup(<PassengerAgreement p={{ id: key, title: "Same TEST name", live: true, status: "signed" }} v={{ signed: true, passengerLinks: restored }} />);
    assert.ok(html.includes(`href="/app/${restored[key]}"`));
    assert.ok(html.includes("file to finish their retainer"));
  }
  assert.ok(!("foreign" in restored));
  assert.ok(!("archived" in restored));
  const siblingView = await linkedFilesFor(db, { id: "child-one", firm_id: "firm-a", external_id: `${parent}:pax:stable-one` });
  assert.ok(siblingView.some(row => row.id === parent));
  assert.ok(siblingView.some(row => row.id === "child-two"));
  assert.deepEqual(passengerFileLinks(siblingView), {});
  assert.ok(queries.every(filters => filters.some(([key, value]) => key === "firm_id" && value === "firm-a")));
  assert.deepEqual(passengerFileLinks(), {});
  assert.deepEqual(passengerFileLinks([linked[0], { ...linked[0], id: "ambiguous" }]), {});
  console.log("linked passenger files: fresh-load card links, same-name identity, legacy key, firm/archive exclusion, sibling boundaries and ambiguity passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
