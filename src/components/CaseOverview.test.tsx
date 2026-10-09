import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CaseOverview from './CaseOverview';

const render = (status: string, signed = false) => renderToStaticMarkup(<CaseOverview
  lead={{ claimant_name: 'Synthetic client' }}
  activeClaim={{ status, claim_type: 'mva', campaign: 'INNO MVA' }}
  signatureConfirmed={signed} onGo={() => {}} />);

assert.match(render('signed_approved'), /Signed: Approved/);
assert.doesNotMatch(render('signed_approved'), /Signed · agent review|Generate, send for signature/);
assert.match(render('signed_grievous'), /Signed: Finish intake/);
assert.match(render('signed_dropped'), /Signed and declined/);
assert.doesNotMatch(render('signed_dropped'), /Start intake/);
assert.match(render('delivered', true), /Signed — sent to firm/);
assert.match(render('delivered', true), /Review the signed agreement/);
assert.doesNotMatch(render('delivered', false), /Signed — sent to firm|Review the signed agreement/);
console.log('File overview: canonical signed status, declined review and matter-specific signature labels passed');
