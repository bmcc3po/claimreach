import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FileOutcomeActions from './FileOutcomeActions';
import FileHeader from './FileHeader';
const actions = (role: string, status: string, campaign = 'INNO MVA', archived = false) => renderToStaticMarkup(<FileOutcomeActions claimId="exact-matter" campaign={campaign} status={status} role={role} archived={archived} />);
assert.equal(actions('owner','delivered'), '', 'all roles use the persistent Current Status editor');

assert.doesNotMatch(actions('agent','delivered'), /BMC declined|Firm decision/);
assert.doesNotMatch(actions('firm','delivered'), /BMC declined|Firm decision/);
assert.doesNotMatch(actions('owner','new'), /BMC declined|Firm decision/);
assert.doesNotMatch(actions('owner','delivered','NETFLY'), /BMC declined/);
assert.doesNotMatch(actions('owner','delivered','INNO MVA',true), /BMC declined|Firm decision/);
assert.equal(actions('owner','signed_dropped'), '', 'legacy outcomes do not expose a competing editable status control');
const html = renderToStaticMarkup(<FileHeader name="Synthetic client" leadNo="TEST-1" backHref="/app" status="Signed" intakeAgent="Synthetic Intake Agent"><input aria-label="Draft" defaultValue="Preserve me" /></FileHeader>);
assert.match(html,/Intake agent: Synthetic Intake Agent/);
assert.match(html,/aria-expanded="true"/); assert.match(html,/Hide header/); assert.match(html,/Preserve me/);
console.log('Shared header: existing role/campaign/archive boundaries and accessible collapse passed');
