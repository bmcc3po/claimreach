// Windows sandbox test processes can throw ENOMEM from os.userInfo() even
// though no memory is exhausted. tsx uses the username only to name a temp
// cache directory. Keep this fallback test-only; application code is untouched.
const os = require('node:os');
const originalUserInfo = os.userInfo;
os.userInfo = (...args) => {
  try { return originalUserInfo(...args); }
  catch (error) {
    if (error?.code !== 'ENOMEM' && error?.info?.code !== 'ENOMEM') throw error;
    return ({
    uid: -1, gid: -1,
    username: process.env.USERNAME || 'claimreach-tests',
    homedir: os.tmpdir(), shell: null,
    });
  }
};
require('node:module').syncBuiltinESMExports();
