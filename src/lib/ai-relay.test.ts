import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'ai-relay.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(proxy = 'https://bridge.example.invalid') {
  const calls: string[] = [], payloads: any[] = [];
  let fail = '', abortOn = '';
  const controller = new AbortController(), api: any = {};
  new Function('exports', 'process', 'fetch', compiled)(api, { env: {
    RELAY_URL: 'https://direct.example.invalid', AI_RELAY_URL: proxy, MAVERICK_RELAY_SECRET: 'test-only', CR_AI_GATE: 'test-only',
  } }, async (url: string, init: any) => {
    calls.push(url); payloads.push(JSON.parse(init.body));
    assert.equal(init.signal, controller.signal, 'both transports share the caller deadline');
    if (url === abortOn) { controller.abort(); throw new Error('aborted'); }
    if (url === fail) throw new Error('unreachable');
    return { ok: true, json: async () => ({ answer: 'test answer' }) };
  });
  return { api, calls, payloads, controller, fail: (url: string) => { fail = url; }, abort: (url: string) => { abortOn = url; } };
}
async function main() {
  let h = harness();
  assert.equal(await h.api.askRelay('system', 'notes', h.controller.signal, {preferProxy:true}), 'test answer');
  assert.deepEqual(h.calls, ['https://bridge.example.invalid'], 'interactive notes avoid waiting for the private connection');
  assert.deepEqual(h.payloads[0], {system:'system',user:'notes'});
  h = harness(); h.fail('https://bridge.example.invalid');
  assert.equal(await h.api.askRelay('system','notes',h.controller.signal,{preferProxy:true}), 'test answer');
  assert.deepEqual(h.calls, ['https://bridge.example.invalid','https://direct.example.invalid']);
  h = harness(''); await h.api.askRelay('s','n',h.controller.signal,{preferProxy:true});
  assert.deepEqual(h.calls, ['https://direct.example.invalid'], 'no bridge still uses the configured direct relay');
  h = harness(); await h.api.askRelay('s','n',h.controller.signal);
  assert.deepEqual(h.calls, ['https://direct.example.invalid'], 'other callers keep their existing preference');
  h = harness(); h.abort('https://bridge.example.invalid');
  assert.equal(await h.api.askRelay('s','n',h.controller.signal,{preferProxy:true}), '');
  assert.equal(h.calls.length,1,'do not start another request after the deadline');
  console.log('Relay transport preference, fallback, payload, missing bridge and cancellation passed');
}
void main().catch(error => {console.error(error);process.exitCode=1;});
