// Local verification adapter only: Windows cannot spawn npm/npx shell shims.
// Invoke the installed npm JS entrypoint with Node, preserving args and options.
const cp = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const npmBin = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin');
// Vercel creates directory aliases for identical .func bundles. Windows
// junctions preserve that relationship without administrator symlink rights.
const fsp = fs.promises;
const symlink = fsp.symlink.bind(fsp);
const callbackSymlink = fs.symlink.bind(fs);
fs.symlink = function(target, destination, type, callback) {
  if (typeof type === 'function') { callback = type; type = undefined; }
  const absolute = path.resolve(path.dirname(destination), target);
  fs.stat(absolute, (err, stat) => {
    if (!err && stat.isDirectory()) callbackSymlink(absolute, destination, 'junction', callback);
    else callbackSymlink(target, destination, type, callback);
  });
};
const syncSymlink = fs.symlinkSync.bind(fs);
fs.symlinkSync = function(target, destination, type) {
  const absolute = path.resolve(path.dirname(destination), target);
  return fs.statSync(absolute).isDirectory() ? syncSymlink(absolute, destination, 'junction') : syncSymlink(target, destination, type);
};
fsp.symlink = async function(target, destination, type) {
  const absolute = path.resolve(path.dirname(destination), target);
  if ((await fsp.stat(absolute)).isDirectory()) return symlink(absolute, destination, 'junction');
  return symlink(target, destination, type);
};
for (const method of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
  const original = cp[method];
  cp[method] = function(command, args, ...rest) {
    const name = path.basename(String(command)).replace(/\.cmd$/i, '').toLowerCase();
    if (['npm', 'npx'].includes(name)) {
      const entry = path.join(npmBin, name === 'npm' ? 'npm-cli.js' : 'npx-cli.js');
      if (!fs.existsSync(entry)) throw new Error(`Missing installed npm entrypoint: ${entry}`);
      return original.call(this, process.execPath, [entry, ...(Array.isArray(args) ? args : [])], ...rest);
    }
    return original.call(this, command, args, ...rest);
  };
}
