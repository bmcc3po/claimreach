// Existing offline TSX tests use classic JSX and import CSS without a bundler.
global.React=require('react');
require.extensions['.css']=()=>{};
