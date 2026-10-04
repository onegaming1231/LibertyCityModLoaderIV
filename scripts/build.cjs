// Builds the window: TypeScript -> JavaScript, then one bundle file, then the styles (Tailwind) and the assets.
// node scripts/build.cjs   (needs: typescript in node_modules, and the Tailwind CLI on PATH or TAILWIND=<path>)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..'), dist = path.join(root, 'dist'), js = path.join(root, 'build', 'js');
const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
rm(dist); rm(js); fs.mkdirSync(dist, { recursive: true });

// 1. TypeScript
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
try { cp.execFileSync(process.execPath, [tsc, '-p', root], { stdio: 'inherit' }); }
catch (e) { if (!fs.existsSync(path.join(js, 'main.js'))) process.exit(1); console.log('(type warnings above - the build goes on)'); }

// 2. bundle (CommonJS modules wrapped in one file; React's production builds)
const PROD = { react: 'react/cjs/react.production.min.js', 'react-dom': 'react-dom/cjs/react-dom.production.min.js', 'react/jsx-runtime': 'react/cjs/react-jsx-runtime.production.min.js', scheduler: 'scheduler/cjs/scheduler.production.min.js' };
const mods = new Map(); const order = [];
function resolve(spec, from) {
  if (PROD[spec]) return path.join(root, 'node_modules', PROD[spec]);
  if (spec.startsWith('.')) {
    const base = path.resolve(path.dirname(from), spec);
    for (const c of [base, base + '.js', path.join(base, 'index.js')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    throw new Error('Cannot find ' + spec + ' from ' + from);
  }
  return require.resolve(spec, { paths: [path.dirname(from), root] });
}
function add(file) {
  if (mods.has(file)) return mods.get(file).id;
  const id = mods.size; const m = { id, file, deps: {} }; mods.set(file, m);
  let src = fs.readFileSync(file, 'utf8').replace(/process\.env\.NODE_ENV/g, '"production"');
  src = src.replace(/\/\/# sourceMappingURL=.*$/gm, '');
  const re = /\brequire\(\s*(['"])([^'"]+)\1\s*\)/g; let r;
  while ((r = re.exec(src))) { const spec = r[2]; if (!(spec in m.deps)) m.deps[spec] = add(resolve(spec, file)); }
  m.src = src; order.push(m);
  return id;
}
const entry = add(path.join(js, 'main.js'));
let out = '(function(){\nvar __m={},__c={};\nfunction __r(id){if(__c[id])return __c[id].exports;var module=__c[id]={exports:{}};__m[id].call(module.exports,module,module.exports);return module.exports;}\n';
for (const m of [...mods.values()].sort((a, b) => a.id - b.id)) {
  out += '__m[' + m.id + ']=function(module,exports){var __d=' + JSON.stringify(m.deps) + ';var require=function(s){return __r(__d[s]);};var process={env:{NODE_ENV:"production"}};\n' + m.src + '\n};\n';
}
out += '__r(' + entry + ');\n})();\n';
fs.writeFileSync(path.join(dist, 'app.js'), out);
console.log('bundle: ' + mods.size + ' modules, ' + Math.round(out.length / 1024) + ' KB');

// 3. styles
const tw = process.env.TAILWIND || 'tailwindcss';
cp.execFileSync(tw, ['-i', path.join(root, 'src', 'index.css'), '-o', path.join(dist, 'index.css'), '--minify', '--cwd', root], { stdio: 'inherit' });

// 4. page + assets
const copyDir = (a, b) => { fs.mkdirSync(b, { recursive: true }); for (const n of fs.readdirSync(a)) { const s = path.join(a, n), d = path.join(b, n); if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d); } };
copyDir(path.join(root, 'public'), dist);
copyDir(path.join(root, 'src', 'assets', 'fonts'), path.join(dist, 'fonts'));
fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self' lcml: data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' lcml: data: blob: https:; media-src 'self' lcml: blob:; connect-src 'self' lcml: data: blob:" />
<title>Liberty City Mod Loader IV</title><link rel="stylesheet" href="./index.css" /></head>
<body><div id="root"></div><script src="./app.js"></script></body></html>
`);
console.log('built into dist/');
