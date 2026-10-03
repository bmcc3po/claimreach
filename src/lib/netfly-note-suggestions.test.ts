import assert from "node:assert/strict";
import { noteSuggestions, sourceEvidence } from "./netfly-note-suggestions";
const notes = "No treatment yet. Can go today. Home near 30303. Morning weekdays. Car was towed. Police report TEST-12. Accident 09/28/2026.";
const rows = [
  {id:"seen_doctor",value:"No",evidence:"No treatment yet"},
  {id:"care_today",value:"Yes",evidence:"Can go today"},
  {id:"treatment_location",value:"Near home",evidence:"Home near 30303"},
  {id:"treatment_area",value:"30303",evidence:"Home near 30303"},
  {id:"treatment_time",value:"Morning",evidence:"Morning weekdays"},
  {id:"treatment_days",value:"Weekdays",evidence:"Morning weekdays"},
  {id:"towed",value:"Yes",evidence:"Car was towed"},
  {id:"police_report",value:"TEST-12",evidence:"Police report TEST-12"},
  {id:"accident_date",value:"2026-09-28",evidence:"Accident 09/28/2026"},
];
assert.equal(noteSuggestions(rows,notes,{}).length,9);
assert.equal(noteSuggestions(rows,notes,{care_today:"No",police_report_unavailable:"Not available yet"}).length,7);
assert.equal(noteSuggestions([...rows,rows[0]],notes,{}).length,9);
for(const id of ["ssn","dob","confirmed_phone","photo_request_permission","fault","review","final_notes"]) assert.equal(noteSuggestions([{id,value:"Yes",evidence:"Can go today"}],notes,{}).length,0);
assert.equal(noteSuggestions([{id:"towed",value:"Maybe",evidence:"Car was towed"}],notes,{}).length,0);
assert.equal(noteSuggestions([{id:"towed",value:"Yes",evidence:"invented quote"}],notes,{}).length,0);
assert.equal(noteSuggestions([{id:"accident_date",value:"2026-02-30",evidence:"Accident 09/28/2026"}],notes,{}).length,0);
assert.equal(noteSuggestions([{id:"first_provider",value:"ER",evidence:"Can go today"}],notes,{seen_doctor:"No"}).length,0);
assert.deepEqual(noteSuggestions(null,notes,{}),[]);
const wrapped = 'The\nclient went to TEST Urgent Care on 09/27/2026. No ambulance\ntransported them.';
const care = noteSuggestions([
  {id:'seen_doctor',value:'Yes',evidence:'The client went to TEST Urgent Care on 09/27/2026.'},
  {id:'first_provider',value:'TEST Urgent Care',evidence:'TEST Urgent Care'},
  {id:'first_visit',value:'2026-09-27',evidence:'09/27/2026'},
  {id:'ambulance',value:'No',evidence:'No ambulance transported them.'},
], wrapped, {});
assert.equal(care.length, 4, 'mail wrapping must not drop the parent or dependent treatment answers');
for (const row of care) assert.ok(wrapped.includes(row.evidence), 'keep the exact received source span');
assert.equal(noteSuggestions(care, wrapped, {}).length, 4, 'evidence survives import save validation');
assert.equal(sourceEvidence('No ambulance came.', 'ambulance transported them.'), null);
assert.equal(sourceEvidence('Provider A\r\n(B).', 'Provider A (B).'), 'Provider A\r\n(B).');
assert.equal(sourceEvidence('Provider AxB', 'Provider A.B'), null, 'punctuation is literal, not a regular expression');
console.log("NETFLY note suggestions: explicit evidence, choices, dates, protected fields and existing answers passed");


