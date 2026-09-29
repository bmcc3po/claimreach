globalThis.fetch = async () => { throw new Error('External network disabled for offline validation'); };
for (const name of ['node:http', 'node:https']) {
  const mod = require(name);
  mod.request = mod.get = () => { throw new Error('External network disabled for offline validation'); };
}
