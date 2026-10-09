import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as links from './mva-call/links';
import * as m6 from './m6';

type Mode = 'ok' | 'server' | 'network' | 'initialize';
function fixture(page: string, initial: Mode, next = '/app/TEST-1') {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app', page, 'page.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let cursor = 0, tree: any, mode = initial, clients = 0;
  const slots: any[] = [], requests: any[] = [], navigations: string[] = [];
  const hooks = {
    useState(v: any) { const i = cursor++; if (!(i in slots)) slots[i] = v; return [slots[i], (n: any) => { slots[i] = typeof n === 'function' ? n(slots[i]) : n; }]; },
    useRef(v: any) { const i = cursor++; return slots[i] ||= { current: v }; },
  };
  const auth = async (input: any) => { requests.push(input); await Promise.resolve(); if (mode === 'network') throw new Error('Internal SDK detail'); return { error: mode === 'server' ? { message: 'Invalid credentials' } : null }; };
  const exports: any = {};
  const deps: Record<string, any> = {
    react: hooks, 'react/jsx-runtime': jsx, 'next/navigation': { useRouter: () => ({ push: (url: string) => navigations.push(url) }) },
    '@/lib/supabase-browser': { supabaseBrowser: () => { clients++; if (mode === 'initialize') throw new Error('Internal configuration detail'); return { auth: { signInWithPassword: auth, signInWithOtp: auth } }; } },
    '@/lib/mva-call/links': links, '@/lib/m6': m6,
  };
  new Function('require', 'exports', 'window', code)((id: string) => deps[id] || { default: () => null, Logo: () => null }, exports, { location: { search: `?next=${encodeURIComponent(next)}`, origin: 'https://claimreach.example.test' } });
  const render = () => { cursor = 0; tree = exports.default(); };
  const nodes = (root: any = tree): any[] => !root || typeof root !== 'object' ? [] : Array.isArray(root) ? root.flatMap(item => nodes(item ?? null)) : [root, ...nodes(root.props?.children ?? null)];
  const text = (root: any = tree): string => root == null || typeof root === 'boolean' ? '' : typeof root !== 'object' ? String(root) : Array.isArray(root) ? root.map(item => text(item ?? null)).join('') : text(root.props?.children ?? null);
  const inputs = () => nodes().filter(n => n.type === 'input');
  const submit = () => nodes().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  render();
  return { render, nodes, text, inputs, submit, flush, requests, navigations, clients: () => clients, mode: (value: Mode) => { mode = value; } };
}

async function main() {
  for (const page of ['login', 'firm-login', 'firm-review-login', 'partner-login']) {
    for (const mode of ['server', 'network', 'initialize'] as const) {
      const f = fixture(page, mode);
      for (const input of f.inputs()) input.props.onChange({ target: { value: input.props.type === 'password' ? 'SYNTHETIC-ONLY' : 'synthetic@example.test' } });
      f.render(); f.submit(); if (mode !== 'initialize') f.submit(); f.render();
      if (mode !== 'initialize') assert.ok(f.inputs().every(n => n.props.disabled));
      await f.flush();
      assert.equal(f.clients(), 1); assert.equal(f.requests.length, mode === 'initialize' ? 0 : 1);
      assert.ok(f.nodes().some(n => n.props?.role === 'alert')); assert.ok(!f.nodes().some(n => n.props?.role === 'status'));
      assert.ok(!f.text().includes('Internal')); assert.equal(f.navigations.length, 0);
      assert.ok(f.inputs().every(n => !n.props.disabled && n.props.value && n.props.required));
      f.mode('ok'); f.submit(); await f.flush();
      assert.ok(!f.nodes().some(n => n.props?.role === 'alert'));
      if (page === 'login') assert.deepEqual(f.navigations, ['/app/TEST-1']);
      else {
        assert.ok(f.nodes().some(n => n.props?.role === 'status'));
        const request = f.requests.at(-1);
        if (page !== 'firm-login') assert.equal(request.options.shouldCreateUser, false);
        else assert.equal(request.options.shouldCreateUser, undefined);
        assert.equal(request.options.emailRedirectTo, `https://claimreach.example.test/auth/callback?next=${page === 'firm-login' ? '%2Fportal' : page === 'firm-review-login' ? '%2Ffirm-review' : '%2Fpartner'}`);
      }
    }
  }
  for (const page of ['login', 'firm-login']) {
    const f = fixture(page, 'ok', 'https://outside.example.test'); f.submit(); await f.flush();
    if (page === 'login') assert.deepEqual(f.navigations, ['/dashboard']);
    else assert.equal(f.requests[0].options.emailRedirectTo, 'https://claimreach.example.test/auth/callback?next=%2Fportal');
  }
  console.log('Login recovery: four real screens, SDK/server/init failure, retained values, retry, duplicate suppression, unchanged destinations and account-creation options passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
