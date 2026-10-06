'use strict';
// Everything around the mods: find other mods, clean up, archive browser + texture viewer, troubleshooting,
// conflict check, sharing lists, Nexus (updates, Mod Manager Download), downloads, essentials and settings.
const fs = require('fs');
const path = require('path');
const os = require('os');
const F = require('./formats.cjs');
const C = require('./core.cjs');
const P = require('./plan.cjs');
const { E, J, lc, eqI, isFile, isDir, exists, leaf, walkFiles, readLines, readText, mkParent, rm } = C;
const status = (t, c) => C.status(t, c);
const friendly = (m) => { const e = new Error(m); e.friendly = true; return e; };

// ================================================================ troubleshooting
const tsPath = () => J(C.dataDir(), 'troubleshoot.json');
const loadTs = () => (isFile(tsPath()) ? C.readJson(tsPath(), null) : null);
const saveTs = (st) => { if (!st) C.rm(tsPath()); else C.writeJson(tsPath(), st); };
const keepOn = (m) => /fusion\s*fix/i.test(String(m.Name)) || (m.Files || []).includes('plugins\\GTAIV.EFLC.FusionFix.asi');
const onModNames = () => C.loadDb().filter(m => C.isOn(m) && !keepOn(m)).map(m => String(m.Name));
function startNoMods() {
  if (loadTs()) return;
  const before = onModNames();
  if (!before.length) { status('All your mods are already off.', 'dim'); return; }
  status('Turning your mods off...', 'dim');
  saveTs({ Mode: 'nomods', Before: before });
  P.setModsState(before, false);
  status(before.length + " mod(s) are off (Fusion Fix stays on). Play the game, then press 'Turn My Mods Back On'.", 'green');
}
function stopTroubleshoot(quiet) {
  const st = loadTs(); if (!st) return;
  status('Turning your mods back on...', 'dim');
  const before = st.Before || [];
  P.setModsState(C.loadDb().filter(m => before.includes(String(m.Name))).map(m => String(m.Name)), true);
  saveTs(null);
  if (!quiet) status('Your mods are back on, just like before.', 'green');
}
function startFindBroken() {
  if (loadTs()) stopTroubleshoot(true);
  const before = onModNames();
  if (!before.length) { status('You have no mods on to test.', 'amber'); return; }
  saveTs({ Mode: 'find', Before: before, Suspects: before, TestOff: before, Step: 0 });
  P.setModsState(before, false);
}
function setFindStep(st) {
  const n = st.Suspects.length, half = st.Suspects.slice(0, Math.ceil(n / 2));
  st.TestOff = half; st.Step = (st.Step | 0) + 1; saveTs(st);
  P.setModsState(half, false);
  P.setModsState(st.Before.filter(x => !half.includes(x)), true);
}
// still = the problem is still there with the test mods off
async function answerFindBroken(still) {
  const st = loadTs(); if (!st || st.Mode !== 'find') return null;
  if ((st.Step | 0) === 0) {
    if (still) {
      stopTroubleshoot(true);
      await E.host.ask("The problem happens even with all your mods off, so it's not one of your mods.\n\nIt could be Fusion Fix, a mod this app doesn't know about, or the game itself.\n\nYour mods are back on.", 'Find the Broken Mod', ['OK']);
      return { done: true };
    }
    st.Suspects = st.Before.slice();
  } else st.Suspects = still ? st.Suspects.filter(x => !st.TestOff.includes(x)) : st.TestOff.slice();
  if (st.Suspects.length <= 1) {
    const bad = st.Suspects[0];
    stopTroubleshoot(true);
    if (bad) {
      const r = await E.host.ask("Found it: '" + bad + "' causes the problem.\n\nAll your other mods are back on. Turn '" + bad + "' off now?", 'Find the Broken Mod', ['Yes', 'No']);
      if (r === 'Yes') P.disableMod(bad);
      status("The broken mod is '" + bad + "'.", 'green');
    }
    return { done: true, bad };
  }
  setFindStep(st);
  return { done: false };
}
function tsState() {
  const st = loadTs(); if (!st) return null;
  return { mode: st.Mode, step: st.Step | 0, off: (st.TestOff || []).length, before: (st.Before || []).length };
}

// ================================================================ conflict check
function conflictCheck() {
  const out = [];
  if (!E.game) return out;
  const seen = new Map(), upd = J(E.game, 'update');
  if (isDir(upd)) for (const f of walkFiles(upd)) {
    const rel = C.relOf(f, E.game);
    if (/^update\\LC Installer Textures\\/i.test(rel)) continue;
    const gp = C.gamePath(rel); if (!seen.has(gp)) seen.set(gp, []); seen.get(gp).push(rel);
  }
  for (const [k, v] of seen) if (v.length > 1) out.push({ result: 'Same file twice', what: k, where: v.join('   |   '), color: 'amber', problem: true });
  if (exists(J(E.game, 'dsound.dll')) && exists(J(E.game, 'dinput8.dll'))) out.push({ result: 'Mods clash', what: "Old ASI loader next to Fusion Fix's loader", where: 'dsound.dll   |   dinput8.dll', color: 'red', problem: true });
  try {
    const mods = C.loadDb();
    for (const [k, v] of C.looseMixSets(mods)) out.push({ result: 'Textures mixed', what: k, where: 'Pictures from: ' + v.map(x => x.mod).join(', ') + '  (lower mod wins the same picture)', color: 'green' });
    for (const [k, v] of C.imgMixSets(mods)) out.push({ result: 'Textures mixed', what: k, where: 'Pictures from: ' + v.map(x => x.mod).join(', ') + '  (lower mod wins the same picture)', color: 'green' });
  } catch (e) { /* */ }
  const n = out.filter(x => x.problem).length;
  if (!n) status('Conflict check: clean record. No conflicts found.', 'green'); else status('Found ' + n + ' problem(s). See the conflict list.', 'amber');
  return out;
}

// ================================================================ mods installed without this app
const WRAPPER_DLLS = ['d3d9.dll', 'd3d8.dll', 'd3d11.dll', 'dxgi.dll', 'dsound.dll', 'winmm.dll', 'version.dll', 'xlive.dll'];
const stem = (n) => n.replace(/\.(net\.dll|asi|dll|cs|vb|ini|cfg|xml|txt|json|log|toml|dat)$/i, '');
function isCoreFile(rel) {
  const n = lc(leaf(rel));
  if (/^put .* here/.test(n) || /^(read ?me|readme_|changelog|license)/.test(n) || n === 'desktop.ini' || n === 'thumbs.db') return true;
  if (/\.(log|dmp|tmp)$/.test(n) || /(^|\\)(logs?|crashdumps?)\\/i.test(rel) || /(^|_)(log|metrics)(_|\.txt$)|session_log|^metrics\.txt$/.test(n)) return true;
  if (eqI(rel, 'dinput8.dll')) return true;
  if (/fusionfix/i.test(rel)) return true;
  return false;
}
const isModGroup = (files) => files.some(r => /^update\\/i.test(r) || /\.(asi|dll|cs|vb|img|rpf|wtd|wdr|wft|wdd|wbd|wbn|wpl|ide|ipl|dat|gxt|sco|nod|wad|whm|fx|fxh|usda|usd|usdc|dds)$/i.test(r) || /^(enbseries|reshade-shaders|rtx_comp|rtx-remix)\\|^(enbseries|enblocal|rtx)\.(ini|conf)$/i.test(r));
const hasCode = (files) => files.some(r => /\.(asi|dll|cs|vb|exe)$/i.test(r));
const normName = (n) => lc(String(n).replace(/\.(net\.dll|asi|dll|cs|vb|ini|cfg|xml|txt|json|dat)$/i, '').replace(/[^A-Za-z0-9]/g, ''));
let fileTextCache = new Map(), foundTimes = new Map(), tidySig = null;
function fileText(rel) {
  if (fileTextCache.has(rel)) return fileTextCache.get(rel);
  let t = ''; const p = J(E.game, rel);
  try { if (fs.statSync(p).size < 16 * 1024 * 1024) { const b = fs.readFileSync(p); t = lc(b.toString('latin1') + '\n' + b.toString('utf16le')); } } catch (e) { /* */ }
  fileTextCache.set(rel, t); return t;
}
function findMergePairs(groups, extra) {
  const pairs = [];
  const coders = [...groups, ...(extra || [])].filter(g => g && hasCode(g.Files));
  for (const g of groups.filter(x => !hasCode(x.Files))) {
    if (g.Name === 'Loose files in update' || g.Files.some(f => /^update\\/i.test(f))) continue;
    const gn = normName(g.Name);
    const dirs = [...new Set(g.Files.map(f => C.parentRel(f)))];
    const words = [];
    for (const d of dirs) { const lf = d ? leaf(d) : ''; if (lf && !['scripts', 'plugins', 'update', 'common', 'pc', 'data', 'config', 'settings'].includes(lc(lf))) words.push(lf); }
    words.push(...g.Files.slice(0, 20).map(f => leaf(f)));
    let best = null, bestScore = 0;
    for (const c of coders) {
      if (c === g) continue;
      let score = 0;
      for (const code of c.Files.filter(f => /\.(asi|dll|cs|vb)$/i.test(f))) {
        const txt = fileText(code); if (!txt) continue;
        if (words.some(w => w.length >= 4 && txt.includes(lc(w)))) { score = 100; break; }
      }
      const cn = normName(c.Name);
      if (gn.length >= 2 && cn.length >= 2) {
        if (cn.startsWith(gn) || gn.startsWith(cn)) score = Math.max(score, 60);
        else if (gn.length >= 3 && (cn.includes(gn) || gn.includes(cn))) score = Math.max(score, 40);
      }
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best && bestScore >= 40) pairs.push({ From: g, To: best });
  }
  return pairs;
}
function foundTime(rel) {
  const k = lc(rel); if (foundTimes.has(k)) return foundTimes.get(k);
  let t = null; try { const st = fs.statSync(J(E.game, rel)); t = st.birthtimeMs || st.ctimeMs; } catch (e) { /* */ }
  foundTimes.set(k, t); return t;
}
const sharedLoader = (g) => g.Key === 'root:scripthook' || g.Key === 'root:gfx' || /^(scripthook|scripthookdotnet|acompleteeditionhook|xlive|dinput8|asiloader)/i.test(g.Name);
function groupRank(g) {
  if (g.Key === 'update:~loose') return 0;
  if (g.Key.startsWith('update:')) return 4;
  if (g.Files.some(f => f.split('\\').length > 2 && /^(scripts|plugins)\\/i.test(f))) return 3;
  if (hasCode(g.Files)) return 2;
  return 1;
}
function joinFoundGroups(groups) {
  const list = [], loose = [];
  for (const g of groups) (g.Key === 'update:~loose' ? loose : list).push(g);
  for (const lg of loose) {
    const timed = lg.Files.map(f => ({ f, t: foundTime(f) })).sort((a, b) => (a.t || 0) - (b.t || 0));
    let cur = null, last = null;
    for (const x of timed) {
      if (!cur || !x.t || !last || (x.t - last) / 1000 > 120) {
        const nm = x.t ? 'Loose update files (' + new Date(x.t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ')' : 'Loose update files';
        cur = { Key: 'update:~loose', Name: nm, Where: 'update', Files: [], Date: lg.Date }; list.push(cur);
      }
      cur.Files.push(x.f); if (x.t) last = x.t;
    }
  }
  for (const g of list) { const ts = g.Files.map(foundTime).filter(Boolean); g.Span = ts.length ? [Math.min(...ts), Math.max(...ts)] : null; }
  const n = list.length, root = [...Array(n).keys()];
  const find = (x) => { while (root[x] !== x) { root[x] = root[root[x]]; x = root[x]; } return x; };
  const norm = list.map(g => normName(g.Name)), loader = list.map(sharedLoader), tight = list.map(g => !!(g.Span && (g.Span[1] - g.Span[0]) / 60000 <= 10));
  for (let i = 0; i < n; i++) {
    if (loader[i]) continue;
    for (let j = i + 1; j < n; j++) {
      if (loader[j]) continue;
      const a = list[i], b = list[j]; let join = false;
      const na = norm[i], nb = norm[j];
      if (a.Key !== 'update:~loose' && b.Key !== 'update:~loose' && na.length >= 5 && nb.length >= 5) {
        const short = na.length <= nb.length ? na : nb, long = na.length <= nb.length ? nb : na;
        if (na === nb || (long.startsWith(short) && /[a-z]/i.test(long[short.length] || ''))) join = true;
      }
      if (!join && tight[i] && tight[j]) { const sa = a.Span, sb = b.Span; if (sa[0] - 120000 <= sb[1] && sb[0] - 120000 <= sa[1]) join = true; }
      if (join) { const ra = find(i), rb = find(j); if (ra !== rb) root[rb] = ra; }
    }
  }
  const sets = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!sets.has(r)) sets.set(r, []); sets.get(r).push(i); }
  const out = [];
  for (const members of sets.values()) {
    let keepAt = members[0];
    for (const m of members) { const rk = groupRank(list[m]), rb = groupRank(list[keepAt]); if (rk > rb || (rk === rb && list[m].Files.length > list[keepAt].Files.length)) keepAt = m; }
    const keep = list[keepAt];
    for (const m of members) if (m !== keepAt) keep.Files.push(...list[m].Files);
    out.push(keep);
  }
  return out;
}
function findExternalMods() {
  const g = E.game; if (!g) return [];
  fileTextCache = new Map(); foundTimes = new Map();
  const owned = new Set(); for (const m of C.loadDb()) for (const f of m.Files || []) if (f) owned.add(lc(f));
  const groups = new Map();
  const add = (key, name, where, rel) => {
    if (owned.has(lc(rel)) || isCoreFile(rel)) return;
    if (/^update\\/i.test(rel) && C.MERGE_TARGETS.includes(lc(rel.substring(7)))) return;
    if (!groups.has(key)) groups.set(key, { Key: key, Name: name, Where: where, Files: [] });
    groups.get(key).Files.push(rel);
  };
  const up = J(g, 'update');
  if (isDir(up)) {
    for (const d of fs.readdirSync(up, { withFileTypes: true })) {
      const p = path.join(up, d.name);
      if (d.isFile()) { add('update:~loose', 'Loose files in update', 'update', C.relOf(p, g)); continue; }
      if (!d.isDirectory()) continue;
      if ([leaf(C.ARCHIVE_DIR), leaf(C.DATA_DIR), leaf(C.MIX_DIR)].some(x => eqI(x, d.name))) continue;
      const loose = ['pc', 'common', 'tlad', 'tbogt'].includes(lc(d.name));
      for (const f of walkFiles(p)) { const rel = C.relOf(f, g); if (loose) add('update:~loose', 'Loose files in update', 'update', rel); else add('update:' + lc(d.name), d.name, 'update\\' + d.name, rel); }
    }
  }
  for (const top of ['scripts', 'plugins']) {
    const base = J(g, top); if (!isDir(base)) continue;
    for (const f of walkFiles(base)) {
      const rel = C.relOf(f, g), inner = rel.substring(top.length + 1);
      const nm = inner.includes('\\') ? inner.split('\\')[0] : stem(path.basename(f));
      add(top + ':' + lc(nm), nm, top, rel);
    }
  }
  let rootFiles = []; try { rootFiles = fs.readdirSync(g, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name); } catch (e) { /* */ }
  const isEnb = exists(J(g, 'enbseries.ini')) || exists(J(g, 'enblocal.ini'));
  const isReshade = exists(J(g, 'reshade-shaders')) || rootFiles.some(n => /^ReShade.*\.ini$/i.test(n));
  const gfxName = isEnb ? 'ENB' : isReshade ? 'ReShade' : 'Graphics / loader';
  const asiStems = rootFiles.filter(n => /\.asi$/i.test(n)).map(n => lc(stem(n)));
  for (const name of rootFiles) {
    const n = lc(name);
    if (/^scripthook/.test(n)) { add('root:scripthook', 'ScriptHook', 'game folder', name); continue; }
    if (/\.asi$/.test(n)) { add('root:' + lc(stem(n)), stem(name), 'game folder', name); continue; }
    if (/\.ini$/.test(n) && asiStems.includes(lc(stem(n)))) { add('root:' + lc(stem(n)), stem(name), 'game folder', name); continue; }
    if (WRAPPER_DLLS.includes(n) || /^(enbseries|enblocal|enbpalette|enbbloom|enbsunsprite|enblens|d3d9)\./.test(n) || /^reshade.*\.(ini|log)$/.test(n) || /\.fx$/.test(n)) { add('root:gfx', gfxName, 'game folder', name); continue; }
  }
  for (const dn of ['enbseries', 'reshade-shaders']) { const dp = J(g, dn); if (isDir(dp)) for (const f of walkFiles(dp)) add('root:gfx', gfxName, 'game folder', C.relOf(f, g)); }
  for (const gr of groups.values()) if (gr.Key === 'root:gfx' && gr.Name === 'Graphics / loader' && gr.Files.length === 1) gr.Name = gr.Files[0];
  const list = joinFoundGroups([...groups.values()].filter(x => x.Files.length));
  for (const pair of findMergePairs(list)) { pair.To.Files.push(...pair.From.Files); pair.From.Files = []; }
  return list.filter(x => x.Files.length && isModGroup(x.Files)).map(x => Object.assign({}, x, foundLabel(x)));
}
function foundLabel(fm) {
  let n = String(fm.Name).replace(/^[\d.\-_ ~!]+(?=\S)/, '').replace(/_/g, ' ');
  if (!n.trim()) n = String(fm.Name);
  const k = fm.Key;
  const type = k === 'update:~loose' ? 'Loose files' : k.startsWith('update:') ? 'Mod' : k.startsWith('scripts:') ? 'Script' : k.startsWith('plugins:') ? 'Plugin' : k === 'root:scripthook' ? 'Script loader' : k === 'root:gfx' ? 'Graphics' : 'Plugin';
  return { Label: n.trim(), Type: type };
}
function addFoundMods(picked) {
  const mods = C.loadDb(); const taken = new Set(mods.map(m => lc(m.Name)));
  const d = new Date(), date = 'Found ' + d.toISOString().slice(0, 10);
  for (const fm of picked) {
    let name = C.cleanName(foundLabel(fm).Label) || C.cleanName(fm.Name) || 'Found mod';
    const base = name; let k = 2; while (taken.has(lc(name))) name = base + ' (' + (k++) + ')';
    taken.add(lc(name));
    const e = { Name: name, Date: date, Files: fm.Files.slice(), Backups: [], Enabled: true, Found: true };
    C.importToLibrary(e); mods.push(e);
  }
  C.saveDb(mods);
  status('Added ' + picked.length + ' mod(s) to My Mods. Untick to turn one off, like any other mod.', 'green');
}
function clearFound(files) {
  let n = 0;
  for (const rel of files) { const p = J(E.game, rel); if (exists(p)) { C.trash(p); n++; C.removeEmptyDirs(path.dirname(p)); } }
  status('Cleared ' + n + " file(s). They're in the Recycle Bin.", 'green');
  return n;
}
function foundKey(rel) {
  const segs = rel.split('\\'), top = lc(segs[0]);
  if (top === 'update') { if (segs.length <= 2 || ['pc', 'common', 'tlad', 'tbogt'].includes(lc(segs[1]))) return ['update:~loose', 'Loose files in update']; return ['update:' + lc(segs[1]), segs[1]]; }
  if (top === 'scripts' || top === 'plugins') { if (segs.length > 2) return [top + ':' + lc(segs[1]), segs[1]]; const st = stem(segs[1]); return [top + ':' + lc(st), st]; }
  const n = segs[segs.length - 1];
  if (/^scripthook/i.test(n)) return ['root:scripthook', 'ScriptHook'];
  if (top === 'enbseries' || top === 'reshade-shaders' || /^(enbseries|enblocal|enbpalette|enbbloom|enbsunsprite|enblens)\.|^reshade|\.fx$/i.test(n)) return ['root:gfx', 'Graphics'];
  const st = stem(n); return ['root:' + lc(st), st];
}
// re-sort mods added from Find Other Mods: split wrong groups, then join extra files to the mod they belong to
function tidyFoundMods(force) {
  const dropped = [];
  if (!E.game) return [];
  if (force) { tidySig = null; fileTextCache = new Map(); foundTimes = new Map(); }
  const mods = C.loadDb();
  const found = mods.filter(m => m.Found && C.isOn(m)); if (!found.length) return [];
  const others = mods.filter(m => !found.includes(m));
  const sig = (arr) => arr.slice().sort((a, b) => a.Name < b.Name ? -1 : 1).map(m => m.Name + '=' + (m.Files || []).slice().sort().join('|')).join(';');
  const before = sig(found);
  if (tidySig && tidySig === before) return [];
  const wasIn = new Map(); for (const m of found) for (const f of m.Files || []) if (f) wasIn.set(lc(f), String(m.Name));
  const groups = new Map();
  for (const m of found) for (const f of m.Files || []) {
    if (!f) continue;
    if (isCoreFile(f)) { dropped.push(f); continue; }
    const k = foundKey(f);
    if (!groups.has(k[0])) groups.set(k[0], { Key: k[0], Name: k[1], Files: [], Date: String(m.Date || '') });
    groups.get(k[0]).Files.push(f);
  }
  let list = joinFoundGroups([...groups.values()]);
  const othersG = others.map(o => ({ Name: o.Name, Files: (o.Files || []).slice(), ref: o }));
  const pairs = findMergePairs(list, othersG);
  const log = [];
  for (const pr of pairs) {
    if (pr.To.ref) { pr.To.ref.Files = [...new Set([...(pr.To.ref.Files || []), ...pr.From.Files])]; pr.To.Files = pr.To.ref.Files; }
    else pr.To.Files.push(...pr.From.Files);
    if (pr.From.Files.some(f => wasIn.get(lc(f)) !== String(pr.To.Name))) log.push(foundLabel(pr.From).Label + '  ->  joined ' + pr.To.Name);
    pr.From.Files = [];
  }
  const notMods = list.filter(g => g.Files.length && !isModGroup(g.Files));
  for (const nm of notMods) dropped.push(...nm.Files);
  list = list.filter(g => g.Files.length && isModGroup(g.Files));
  const taken = new Set(others.map(o => lc(o.Name)));
  const nw = [];
  for (const g of list) {
    let name = C.cleanName(foundLabel(g).Label) || 'Found mod';
    const base = name; let k = 2; while (taken.has(lc(name))) name = base + ' (' + (k++) + ')';
    taken.add(lc(name));
    nw.push({ Name: name, Date: g.Date, Files: g.Files.slice(), Backups: [], Enabled: true, Found: true });
  }
  const after = sig(nw);
  const toOthers = pairs.filter(p => p.To.ref).length;
  if (after === before && !toOthers && !notMods.length) { tidySig = before; return []; }
  tidySig = after;
  const dep = C.loadDeployed(), nowIn = new Map();
  for (const g of [...nw, ...others]) for (const f of g.Files || []) if (f) nowIn.set(lc(f), g);
  for (const om of found) {
    for (const f of (om.Files || []).filter(Boolean)) {
      const from = C.libFile(om.Name, f), k = lc(f), to = nowIn.get(k);
      if (to && String(to.Name) !== String(om.Name)) {
        const dst = C.libFile(to.Name, f);
        if (exists(from) && !exists(dst)) { mkParent(dst); fs.renameSync(from, dst); }
        else if (!exists(dst) && exists(J(E.game, f))) C.placeFile(J(E.game, f), dst);
        if (dep[k] === String(om.Name)) dep[k] = String(to.Name);
      } else if (!to) { if (exists(from)) rm(from); delete dep[k]; }
    }
    const ld = J(C.dataDir(), 'library', om.Name);
    if (isDir(ld) && !walkFiles(ld).length) rm(ld);
  }
  for (const g of nw) g.Library = true;
  C.saveDeployed(dep);
  const out = []; let placed = false;
  for (const m of mods) { if (found.includes(m)) { if (!placed) { out.push(...nw); placed = true; } } else out.push(m); }
  C.saveDb(out);
  const changes = [...log];
  const oldNames = found.map(m => String(m.Name)), newNames = nw.map(m => String(m.Name)), droppedL = dropped.map(lc);
  for (const om of found) {
    if (newNames.includes(String(om.Name))) continue;
    if (!(om.Files || []).filter(f => f && !droppedL.includes(lc(f))).length) continue;
    changes.push(om.Name + '  ->  removed (its files are now listed under the right mod)');
  }
  for (const nn of newNames) if (!oldNames.includes(nn)) changes.push(nn + '  ->  new name (was part of a wrongly named row)');
  for (const d of dropped.slice(0, 8)) changes.push(leaf(d) + '  ->  not a mod, hidden from the list (the file stays where it is)');
  return [...new Set(changes)];
}

// ================================================================ clean up (leftovers)
function relFiles(relDir) {
  const p = J(E.game, relDir); if (!exists(p)) return [];
  if (isFile(p)) return [relDir];
  return walkFiles(p).map(f => C.relOf(f, E.game));
}
function isFFFork(p) { try { const b = fs.readFileSync(p); return lc(b.toString('latin1')).includes('rtx remix') || lc(b.toString('utf16le')).includes('rtx remix'); } catch (e) { return false; } }
function findLeftovers() {
  const items = []; if (!E.game) return items;
  const g = E.game, mods = C.loadDb(), on = mods.filter(C.isOn);
  const owned = new Map(); for (const m of on) for (const f of m.Files || []) if (f) owned.set(lc(f), String(m.Name));
  const isOwned = (r) => owned.has(lc(r));
  const rtxOn = on.some(m => (m.Files || []).some(f => /(^|\\)rtx_comp\\/i.test(f)));
  let rootFiles = []; try { rootFiles = fs.readdirSync(g, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name); } catch (e) { /* */ }
  if (!rtxOn) {
    let rtx = [];
    for (const d of ['.trex', 'rtx-remix', 'rtx_comp', 'plugins\\rtx-remix']) rtx.push(...relFiles(d));
    for (const n of rootFiles) if (/^(rtx\.conf|dxvk\.conf|_LaunchWithProcessorAffinity.*\.bat|a_gta4-rtx\.asi|NvRemixBridge\.exe|GTAIV-Remix.*)$/i.test(n)) rtx.push(n);
    for (const f of relFiles('plugins')) if (/^plugins\\(a_)?gta4-rtx\.asi$/i.test(f)) rtx.push(f);
    if (rtx.length && exists(J(g, 'd3d9.dll')) && !isOwned('d3d9.dll')) rtx.push('d3d9.dll');
    rtx = [...new Set(rtx.filter(r => !isOwned(r)))];
    if (rtx.length) items.push({ Title: 'RTX Remix leftovers', Why: "RTX Remix isn't installed any more, but its files are still here. They can change how the game looks.", Files: rtx, Tick: true, Action: 'recycle' });
  }
  const ffAsi = J(g, 'plugins\\GTAIV.EFLC.FusionFix.asi');
  if (!rtxOn && isFile(ffAsi) && isFFFork(ffAsi)) items.push({ Title: 'Fusion Fix is still the RTX version', Why: 'The RTX version changes lighting and shaders. This puts back the normal Fusion Fix (downloads the latest one).', Files: ['plugins\\GTAIV.EFLC.FusionFix.asi'], Tick: true, Action: 'reinstall-ff' });
  if (on.some(m => (m.Files || []).some(f => /fusionfix\.asi$/i.test(f)))) {
    const sh = relFiles('update').filter(r => /[\\/]shaders[\\/]/i.test(r)).filter(r => !isOwned(r) || /^Loose.*update/i.test(owned.get(lc(r))));
    if (sh.length) items.push({ Title: 'Leftover shader files', Why: 'Old graphics files in the update folder that no mod uses. They change lighting and the sky.', Files: sh, Tick: true, Action: 'recycle' });
  }
  let enb = [];
  for (const n of ['enbseries.ini', 'enblocal.ini', 'enbpalette.bmp', 'enbbloom.fx', 'enbeffect.fx', 'enbclouds.fx', 'd3d9.fx']) if (exists(J(g, n))) enb.push(n);
  enb.push(...relFiles('enbseries'), ...relFiles('reshade-shaders'));
  for (const n of rootFiles) if (/^ReShade.*\.ini$/i.test(n)) enb.push(n);
  enb = [...new Set(enb.filter(r => !isOwned(r)))];
  if (enb.length) items.push({ Title: 'Old ENB / ReShade files', Why: 'Graphics settings with no mod in your list. They change colors and effects.', Files: enb, Tick: false, Action: 'recycle' });
  for (const w of ['d3d9.dll', 'dxgi.dll', 'd3d11.dll', 'd3d8.dll']) {
    if (exists(J(g, w)) && !isOwned(w) && !items.some(x => x.Files.includes(w))) items.push({ Title: w + ' with no mod using it', Why: "Usually left behind by a graphics mod. Only clear it if you don't use ENB, ReShade, DXVK or RTX.", Files: [w], Tick: false, Action: 'recycle' });
  }
  const names = mods.map(m => lc(m.Name)), data = C.dataDir(), old = [];
  for (const sub of ['disabled', 'backups', 'archives', 'library']) {
    const d = J(data, sub); if (!isDir(d)) continue;
    for (const x of fs.readdirSync(d, { withFileTypes: true })) if (x.isDirectory() && !names.includes(lc(x.name))) old.push(...walkFiles(path.join(d, x.name)).map(f => C.relOf(f, g)));
  }
  const t = J(data, 'temp'); if (isDir(t)) old.push(...walkFiles(t).map(f => C.relOf(f, g)));
  if (old.length) items.push({ Title: 'Old installer data', Why: "Saved copies for mods that aren't in your list any more.", Files: old, Tick: true, Action: 'recycle' });
  let logs = [];
  for (const top of ['', 'plugins', 'scripts']) {
    const d = top ? J(g, top) : g; if (!isDir(d)) continue;
    for (const x of fs.readdirSync(d, { withFileTypes: true })) if (x.isFile() && (/\.(log|dmp)$/i.test(x.name) || /^(metrics\.txt|.*session_log\.txt)$/i.test(x.name))) logs.push(C.relOf(path.join(d, x.name), g));
  }
  logs = logs.filter(r => !isOwned(r));
  if (logs.length) items.push({ Title: 'Log and crash files', Why: 'Written by the game and mods while playing. Safe to remove.', Files: logs, Tick: true, Action: 'recycle' });
  return items;
}
function cleanLeftovers(picked) {
  let n = 0, ff = false; const mods = C.loadDb(); let dbChanged = false;
  for (const it of picked) {
    if (it.Action === 'reinstall-ff') { ff = true; continue; }
    for (const rel of it.Files) {
      const p = J(E.game, rel);
      if (exists(p)) { C.trash(p); n++; C.removeEmptyDirs(path.dirname(p)); }
      for (const m of mods) {
        if (/^Loose.*update/i.test(String(m.Name)) && (m.Files || []).some(f => eqI(f, rel))) {
          m.Files = m.Files.filter(f => !eqI(f, rel)); dbChanged = true;
          rm(C.libFile(m.Name, rel));
          const dep = C.loadDeployed(); delete dep[lc(rel)]; C.saveDeployed(dep);
        }
      }
    }
  }
  for (const sub of ['disabled', 'backups', 'archives', 'library']) {
    const dd = J(C.dataDir(), sub); if (!isDir(dd)) continue;
    for (const x of fs.readdirSync(dd, { withFileTypes: true })) if (x.isDirectory() && !walkFiles(path.join(dd, x.name)).length) rm(path.join(dd, x.name));
  }
  if (dbChanged) C.saveDb(mods.filter(m => (m.Files || []).length || !m.Found));
  status('Cleaned ' + n + " file(s). They're in the Recycle Bin.", 'green');
  return { cleaned: n, reinstallFF: ff };
}

// ================================================================ archive browser + textures
const archiveSessions = new Map();   // texture files open in the viewer
function listArchives() { return C.gameArchives().sort().map(rel => ({ rel, name: leaf(rel), where: C.parentRel(rel) })); }
function typeOf(n, rsc) {
  if (/\.wtd$/i.test(n)) return 'Textures'; if (/\.wft$/i.test(n)) return 'Car / object (3D)'; if (/\.wdr$/i.test(n)) return 'Object (3D)'; if (/\.wdd$/i.test(n)) return 'Character (3D)';
  if (/\.wbn$|\.wbd$/i.test(n)) return 'Collision'; if (/\.(ide|ipl|wpl)$/i.test(n)) return 'Map data'; if (/\.(dat|xml|txt|csv)$/i.test(n)) return 'Data'; if (/\.sco$/i.test(n)) return 'Game script';
  return rsc ? 'Resource' : 'File';
}
function archiveFiles(rel) {
  const list = C.readArchiveList(rel, C.archiveKey());
  return list.map(x => ({ archive: rel, inner: x.inner, name: x.inner.split('/').pop(), folder: x.inner.includes('/') ? x.inner.substring(0, x.inner.lastIndexOf('/')) : '', size: x.size, type: typeOf(x.inner, x.rsc) }));
}
function findInGameArchives(q) {
  q = lc(String(q).trim()); if (!q) return [];
  const ix = C.archiveIndex(); const out = [];
  for (const k of [...ix.keys()].filter(k => k.includes(q)).sort().slice(0, 500)) for (const h of ix.get(k)) out.push({ archive: h.Archive, inner: h.Inner, name: h.Inner.split('/').pop(), folder: h.Archive, size: null, type: typeOf(k, false) });
  return out;
}
function extractFromArchive(archive, inner) {
  const p = J(E.game, archive), key = C.archiveKey();
  return /\.img$/i.test(archive) ? F.img.extract(p, key, inner) : F.rpf.extract(p, key, inner);
}
function takeOut(items, folder) {
  let ok = 0; const bad = [];
  for (const t of items) {
    try { const b = extractFromArchive(t.archive, t.inner); if (!b) { bad.push(t.inner); continue; } fs.writeFileSync(path.join(folder, t.inner.split('/').pop()), b); ok++; }
    catch (e) { bad.push(t.inner); }
  }
  return { ok, bad };
}
function archiveRow(src, hit, mod) {
  const lf = leaf(hit.Archive);
  if (/\.img$/i.test(hit.Archive)) return { Source: src, Dest: 'update\\' + mod + '\\' + C.imgName(mod), Kind: 'IMG', Note: 'Replaces ' + path.basename(src) + ' from ' + lf + ' - packed into an archive Fusion Fix loads' };
  return { Source: src, Dest: hit.Archive + '|' + hit.Inner, Kind: 'ARCHIVE', Note: 'Replaces ' + hit.Inner + ' inside ' + lf + ' - packed automatically' };
}
// a changed or replaced file becomes a "Replace ..." mod in Install
function replacePlan(src, t) {
  const lf = t.inner.split('/').pop();
  if (!eqI(path.basename(src), lf)) {
    const tmp = J(C.dataDir(), 'temp', 'replace-' + Math.random().toString(16).slice(2, 10)); fs.mkdirSync(tmp, { recursive: true });
    fs.copyFileSync(src, path.join(tmp, lf)); src = path.join(tmp, lf);
  }
  const mod = C.cleanName('Replace ' + path.basename(lf, path.extname(lf)));
  return { modName: mod, rows: [archiveRow(src, { Archive: t.archive, Inner: t.inner }, mod)], checks: [], warning: '', source: null };
}
function addFilesPlan(archive, folder, files) {
  const mod = C.cleanName('Added to ' + path.basename(archive, path.extname(archive)));
  return { modName: mod, rows: files.map(fn => archiveRow(fn, { Archive: archive, Inner: (folder || '') + lc(path.basename(fn)) }, mod)), checks: [], warning: '', source: null };
}
// ---- texture viewer: open a .wtd (from an archive or a file), see / save / replace pictures
let texId = 0;
// ---- 3D preview of a model (.wdr, .wft, .wdd) with its pictures ----
const M = require('./models.cjs');
function openModel(src) {
  const name = src.file ? path.basename(src.file) : src.inner.split('/').pop();
  const bytes = src.file ? fs.readFileSync(src.file) : extractFromArchive(src.archive, src.inner);
  if (!bytes) throw friendly("Couldn't read that model file.");
  const m = M.read(bytes, name);
  const base = name.replace(/\.[^.]+$/, '');
  const tex = new Map(m.textures); const found = [];
  const need = () => m.want.filter(w => !tex.has(w));
  const add = (label, getBytes) => {
    if (!need().length) return;
    try { const b = getBytes(); if (!b) return; let n = 0; for (const [k, v] of M.wtdTextures(b)) if (!tex.has(k)) { tex.set(k, v); if (m.want.includes(k)) n++; } if (n) found.push(label); } catch (e) { /* not a texture file */ }
  };
  // 1. the texture file with the same name next to the model
  if (src.file) {
    const dir = path.dirname(src.file); let names = []; try { names = fs.readdirSync(dir); } catch (e) { /* */ }
    const same = names.find(n => lc(n) === lc(base) + '.wtd'); if (same) add(same, () => fs.readFileSync(path.join(dir, same)));
    for (const n of names) if (/\.wtd$/i.test(n) && n !== same) add(n, () => fs.readFileSync(path.join(dir, n)));
  } else {
    const dir = src.inner.includes('/') ? src.inner.substring(0, src.inner.lastIndexOf('/') + 1) : '';
    const tryIn = (inner) => add(inner.split('/').pop(), () => { try { return extractFromArchive(src.archive, inner); } catch (e) { return null; } });
    tryIn(src.inner.replace(/\.[^./]+$/, '.wtd'));
    // character parts keep each picture in its own file named like the picture
    for (const w of need()) tryIn(dir + w + '.wtd');
  }
  // 2. the game's own copies (the same name, then the pictures all cars share)
  if (E.game) {
    const fromGame = (fn) => { const h = C.findInArchives(fn); if (h) add(fn, () => extractFromArchive(h.Archive, h.Inner)); };
    try { fromGame(base + '.wtd'); for (const w of need().slice(0, 12)) fromGame(w + '.wtd'); if (m.kind === 'car') { fromGame('vehshare.wtd'); fromGame('vehshare_truck.wtd'); } } catch (e) { /* game archives can't be read */ }
  }
  const textures = {};
  for (const w of m.want) { const t = tex.get(w); if (!t) continue; try { textures[w] = M.texturePicture(t, 512); } catch (e) { /* odd picture type */ } }
  return { title: name, kind: m.kind, parts: m.parts, textures, missing: need(), found };
}

function openTextures(src) {
  const bytes = src.file ? fs.readFileSync(src.file) : extractFromArchive(src.archive, src.inner);
  if (!bytes) throw friendly("Couldn't read that texture file.");
  const w = F.Wtd.load(bytes);
  const id = 'tx' + (++texId);
  archiveSessions.set(id, { w, src });
  return { id, title: src.file ? path.basename(src.file) : src.inner.split('/').pop(), textures: w.textures.map((t, i) => ({ index: i, name: t.name, width: t.width, height: t.height, type: F.formatName(t.format) })) };
}
function texturePixels(id, index) {
  const s = archiveSessions.get(id); if (!s) throw friendly('That texture window was closed.');
  const t = s.w.textures[index];
  return { width: t.width, height: t.height, bgra: s.w.pixels(index) };
}
// levels: [{w, h, bgra}] - the new picture already resized by the window for every level
function replaceTexture(id, index, levels) {
  const s = archiveSessions.get(id); if (!s) throw friendly('That texture window was closed.');
  const byKey = new Map(levels.map(l => [l.w + 'x' + l.h, Buffer.from(l.bgra)]));
  s.w.replace(index, (w, h) => { const b = byKey.get(w + 'x' + h); if (!b) throw friendly('Missing picture size ' + w + 'x' + h); return b; });
  s.changed = true;
  const t = s.w.textures[index];
  return { width: t.width, height: t.height, bgra: s.w.pixels(index) };
}
function textureLevels(id, index) { const s = archiveSessions.get(id); const t = s.w.textures[index]; const out = []; for (let l = 0; l < t.levels; l++) out.push({ w: Math.max(1, t.width >> l), h: Math.max(1, t.height >> l) }); return out; }
// done: from an archive -> a Replace mod plan; from a file -> saved to savePath
function finishTextures(id, savePath) {
  const s = archiveSessions.get(id); archiveSessions.delete(id);
  if (!s || !s.changed) return null;
  const data = s.w.save();
  if (s.src.file) { fs.writeFileSync(savePath || s.src.file, data); return { saved: savePath || s.src.file }; }
  const lf = s.src.inner.split('/').pop();
  const tmp = J(C.dataDir(), 'temp', 'tex-' + Math.random().toString(16).slice(2, 10)); fs.mkdirSync(tmp, { recursive: true });
  const tf = path.join(tmp, lf); fs.writeFileSync(tf, data);
  return { plan: replacePlan(tf, s.src) };
}
function closeTextures(id) { archiveSessions.delete(id); }

// ================================================================ sharing a mod list
function exportModList(file) {
  const mods = C.loadDb(); if (!mods.length) { status('You have no mods to share yet.', 'amber'); return null; }
  const list = mods.map((m, i) => { const s = C.modSource(m); return { Name: String(m.Name), On: C.isOn(m), Order: i, Url: s ? String(s.Url || '') : '', NexusId: s ? String(s.NexusId || '') : '', Version: s ? String(s.Version || '') : '' }; });
  C.writeJson(file, { App: 'Liberty City Mod Loader IV', Made: new Date().toISOString().slice(0, 10), Mods: list });
  status('Saved your list (' + list.length + ' mods, ' + list.filter(x => x.Url).length + ' with a download link). Send the file to your friend. They open it with Share > Open a List.', 'green');
  return list.length;
}
async function importModList(file) {
  let x; try { x = JSON.parse(readText(file)); } catch (e) { status("That file isn't a mod list.", 'red'); return null; }
  const theirs = (x.Mods || []).slice().sort((a, b) => (a.Order | 0) - (b.Order | 0));
  if (!theirs.length) { status('That list is empty.', 'amber'); return null; }
  const mine = C.loadDb();
  const match = (t) => mine.find(m => { const s = C.modSource(m); return (t.NexusId && s && String(s.NexusId) === String(t.NexusId)) || eqI(m.Name, t.Name); });
  const have = [], missing = [];
  for (const t of theirs) { const m = match(t); if (m) have.push({ mine: m, theirs: t }); else missing.push(t); }
  let msg = 'This list has ' + theirs.length + ' mod(s). You already have ' + have.length + '.';
  let open = [];
  if (missing.length) {
    msg += "\n\nYou don't have:\n" + missing.slice(0, 12).map(t => '- ' + t.Name + (t.Url ? '' : '  (no link)')).join('\n');
    if (missing.length > 12) msg += '\n...and ' + (missing.length - 12) + ' more';
    const links = missing.filter(t => t.Url);
    if (links.length) { const r = await E.host.ask(msg + '\n\nOpen the download pages of the ' + links.length + ' mod(s) with a link?', 'Open a Mod List', ['Yes', 'No']); if (r === 'Yes') open = links.slice(0, 15).map(t => t.Url); }
    else await E.host.ask(msg, 'Open a Mod List', ['OK']);
  }
  if (have.length) {
    const r = await E.host.ask('Also turn your ' + have.length + ' matching mod(s) on/off and put them in the same order as this list?', 'Open a Mod List', ['Yes', 'No']);
    if (r === 'Yes') {
      const onNames = have.filter(h => h.theirs.On).map(h => String(h.mine.Name)), offNames = have.filter(h => !h.theirs.On).map(h => String(h.mine.Name));
      const mods = C.loadDb(), ordered = have.map(h => String(h.mine.Name));
      C.saveDb([...mods.filter(m => !ordered.includes(String(m.Name))), ...ordered.map(n => mods.find(m => String(m.Name) === n))]);
      P.setModsState(offNames, false); P.setModsState(onNames, true);
      const all = C.loadDb().filter(m => ordered.includes(String(m.Name))).flatMap(m => m.Files || []);
      if (all.length) C.syncFiles(all, C.loadDb());
      if (C.loadDb().some(m => ordered.includes(String(m.Name)) && C.touchesArchive(m))) C.rebuildArchives();
      status('Your mods now match the list.', 'green');
    }
  }
  return { open };
}

// ================================================================ settings (per game folder) and Nexus
const settingsPath = () => J(C.dataDir(), 'settings.json');
function loadSettings() { const s = { WatchDownloads: true, OldNxm: '', NexusLogin: '' }; if (E.game) Object.assign(s, C.readJson(settingsPath(), {}) || {}); return s; }
function saveSettings(s) { if (E.game) C.writeJson(settingsPath(), s); }
// ---- Nexus Mods login (OAuth 2 with PKCE - the way Nexus asks apps to sign in; no API keys)
// The login and refresh tokens are stored encrypted with your Windows account (Electron safeStorage = Windows DPAPI).
const crypto = require('crypto');
const OAUTH_URL = process.env.LCML_TEST_OAUTH_URL || 'https://users.nexusmods.com/oauth';   // (the test setting is only for the automatic tests)
const NEXUS_API = process.env.LCML_TEST_NEXUS_API || 'https://api.nexusmods.com/v1/';
// the app's id, given by Nexus Mods for this app
const OAUTH_CLIENT_ID = process.env.LCML_OAUTH_CLIENT_ID || 'liberty_city_mod_loader_iv';
const APP_HEADERS = { 'Application-Name': 'LibertyCityModLoaderIV', 'Application-Version': '1.0' };
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function jwtPayload(t) { try { return JSON.parse(Buffer.from(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return {}; } }
// old API keys (from earlier versions) are not used any more - they are removed
function dropOldKeys(s) { if (s.NexusKey || s.NexusKeyV2) { delete s.NexusKey; delete s.NexusKeyV2; s.HadOldKey = true; return true; } return false; }
async function saveTokens(tok) {
  const s = loadSettings(); dropOldKeys(s);
  s.NexusLogin = tok ? await E.host.secret('encrypt', JSON.stringify({ access: tok.access_token, refresh: tok.refresh_token })) : '';
  saveSettings(s);
}
async function loadTokens() {
  const s = loadSettings(); if (dropOldKeys(s)) saveSettings(s);
  if (!s.NexusLogin) return null;
  try { const t = JSON.parse((await E.host.secret('decrypt', s.NexusLogin)) || 'null'); return t && t.access ? t : null; } catch (e) { return null; }
}
async function postForm(url, body) {
  const res = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Accept: 'application/json' }, APP_HEADERS), body: new URLSearchParams(body).toString() });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = friendly('Nexus login: ' + (j.error_description || j.error || res.status + ' ' + res.statusText)); e.code = j.error; throw e; }
  return j;
}
let refreshing = null;
// a working access token (renewed by itself shortly before it runs out); '' when not logged in
async function accessToken(force) {
  const t = await loadTokens(); if (!t) return '';
  const exp = jwtPayload(t.access).exp;
  if (!force && (!exp || exp * 1000 - Date.now() > 60000)) return t.access;
  if (!t.refresh) return t.access;
  if (!refreshing) refreshing = (async () => {
    try { const r = await postForm(OAUTH_URL + '/token', { grant_type: 'refresh_token', client_id: OAUTH_CLIENT_ID, refresh_token: t.refresh }); await saveTokens(r); return r.access_token; }
    catch (e) { if (e.code === 'invalid_grant') { await saveTokens(null); return ''; } throw e; }
    finally { refreshing = null; }
  })();
  return refreshing;
}
function resultPage(res, ok, msg) {
  res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html><head><title>Liberty City Mod Loader IV</title></head><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#111214;color:#e9edf3;font-family:Segoe UI,Arial,sans-serif;text-align:center">'
    + '<div><h1 style="font-weight:600;color:' + (ok ? '#E8A33D' : '#f87171') + '">' + (ok ? 'You are logged in!' : 'Login did not work') + '</h1><p style="font-size:17px">' + msg + '</p></div></body></html>');
}
let login = null;
// opens the Nexus Mods login page in your browser and waits for you to say yes
function nexusLogin() {
  if (login) login.cancel('A new login was started.');
  const http = require('http');
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  return new Promise((resolve, reject) => {
    let redirect = '', finished = false;
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      const code = u.searchParams.get('code'), err = u.searchParams.get('error');
      if (!code && !err) { res.writeHead(404); res.end(); return; }
      if (u.searchParams.get('state') !== state) { resultPage(res, false, 'This login link is old. Please press Log In again in the app.'); return; }
      try {
        if (err) throw friendly('Nexus said: ' + (u.searchParams.get('error_description') || err));
        const tok = await postForm(OAUTH_URL + '/token', { grant_type: 'authorization_code', client_id: OAUTH_CLIENT_ID, redirect_uri: redirect, code, code_verifier: verifier });
        await saveTokens(tok);
        resultPage(res, true, 'You can close this page and go back to Liberty City Mod Loader IV.');
        done(); resolve(await nexusAccount());
      } catch (e) { resultPage(res, false, 'Please go back to the app and try again.'); done(); reject(e); }
    });
    const timer = setTimeout(() => { done(); reject(friendly('The login took too long. Please press Log In again.')); }, 10 * 60000);
    const done = () => { if (finished) return; finished = true; clearTimeout(timer); try { server.close(); } catch (e) { /* */ } login = null; };
    login = { cancel: (why) => { done(); reject(friendly(why || 'Login cancelled.')); } };
    server.on('error', (e) => { done(); reject(e); });
    server.listen(0, '127.0.0.1', () => {
      redirect = 'http://127.0.0.1:' + server.address().port;
      const q = new URLSearchParams({ response_type: 'code', client_id: OAUTH_CLIENT_ID, redirect_uri: redirect, scope: 'openid public', state, code_challenge_method: 'S256', code_challenge: challenge });
      E.host.open(OAUTH_URL + '/authorize?' + q.toString());
      status('Log in on the Nexus Mods page that opened in your browser, then press Authorise.', 'dim');
    });
  });
}
function nexusLoginCancel() { if (login) login.cancel('Login cancelled.'); return true; }
async function nexusLogout() {
  await saveTokens(null);
  const s = loadSettings(); delete s.HadOldKey; saveSettings(s);
  status('Logged out of Nexus Mods.', 'dim'); return true;
}
async function nexus(p, retried) {
  const token = await accessToken();
  if (!token) throw friendly('Log in with your Nexus Mods account in Settings first.');
  const res = await fetch(NEXUS_API + p, { headers: Object.assign({ Authorization: 'Bearer ' + token, Accept: 'application/json' }, APP_HEADERS) });
  if (res.status === 401 && !retried) { if (await accessToken(true)) return nexus(p, true); throw friendly('Please log in to Nexus Mods again (Settings).'); }
  if (!res.ok) throw friendly('Nexus said: ' + res.status + ' ' + res.statusText);
  return res.json();
}
async function nexusAccount() {
  const t = await loadTokens(); const old = !!loadSettings().HadOldKey;
  if (!t) return { connected: false, oldKey: old };
  try { const me = await nexus('users/validate.json'); return { connected: true, name: me.name, premium: !!me.is_premium }; }
  catch (e) {
    const u = (jwtPayload(t.access).user) || {};
    if (u.username && await loadTokens()) return { connected: true, name: u.username, premium: (u.membership_roles || []).includes('premium'), offline: true };
    return { connected: false, bad: true };
  }
}
function newNexusSource(modId, file, mod) {
  return { Site: 'Nexus', NexusId: String(modId), FileId: file ? String(file.file_id) : '', Version: file && file.version ? String(file.version) : (mod ? String(mod.version || '') : ''), Uploaded: file ? Number(file.uploaded_timestamp || 0) : 0, Url: 'https://www.nexusmods.com/' + P.NEXUS_GAME + '/mods/' + modId, Picture: mod ? String(mod.picture_url || '') : '' };
}
const mainFiles = (files) => { let m = (files || []).filter(f => f.category_name === 'MAIN').sort((a, b) => b.uploaded_timestamp - a.uploaded_timestamp); if (!m.length) m = (files || []).filter(f => f.category_name !== 'OLD_VERSION' && f.category_name !== 'ARCHIVED').sort((a, b) => b.uploaded_timestamp - a.uploaded_timestamp); return m; };
const verKey = (v) => lc(String(v).replace(/^v/i, '').replace(/[\s_-]+/g, '.').replace(/^\.+|\.+$/g, ''));
// nxm://gta4/mods/123/files/456?key=...&expires=...
async function nxmToDownload(link) {
  const m = /^nxm:\/\/([^/]+)\/mods\/(\d+)\/files\/(\d+)\?(.*)$/i.exec(link);
  if (!m) throw friendly("That Nexus link doesn't look right.");
  if (!eqI(m[1], P.NEXUS_GAME)) throw friendly('That link is for another game (' + m[1] + '), not GTA IV.');
  const q = new URLSearchParams(m[4]);
  status('Calling Nexus...', 'dim');
  const info = await nexus('games/' + P.NEXUS_GAME + '/mods/' + m[2] + '/files/' + m[3] + '.json');
  const mod = await nexus('games/' + P.NEXUS_GAME + '/mods/' + m[2] + '.json');
  let p = 'games/' + P.NEXUS_GAME + '/mods/' + m[2] + '/files/' + m[3] + '/download_link.json';
  if (q.get('key')) p += '?key=' + q.get('key') + '&expires=' + q.get('expires');
  const links = await nexus(p);
  if (!links || !links.length) throw friendly('Nexus gave no download link.');
  return { url: links[0].URI, fileName: info.file_name, modName: mod.name, source: newNexusSource(m[2], info, mod) };
}
// a Nexus mod page: Premium downloads straight away, free accounts are sent to the Files tab
async function nexusPageToDownload(url) {
  const m = /nexusmods\.com\/(?:games\/)?([^/?#]+)\/mods\/(\d+)/i.exec(url);
  if (!m) throw friendly("That doesn't look like a Nexus mod page.");
  const modId = m[2], filesPage = 'https://www.nexusmods.com/' + P.NEXUS_GAME + '/mods/' + modId + '?tab=files';
  try {
    const me = await nexus('users/validate.json');
    if (!me.is_premium) { status('Free Nexus account: log in and click Manual Download (or Mod Manager Download) on the Files tab.', 'amber'); return { browse: filesPage }; }
    const files = await nexus('games/' + P.NEXUS_GAME + '/mods/' + modId + '/files.json');
    const main = mainFiles(files.files); if (!main.length) throw friendly('This mod has no files to download.');
    if (main.length > 1) status('This mod has several main files - taking the newest. Use Mod Manager Download on Nexus to pick another.', 'amber');
    const mod = await nexus('games/' + P.NEXUS_GAME + '/mods/' + modId + '.json');
    const links = await nexus('games/' + P.NEXUS_GAME + '/mods/' + modId + '/files/' + main[0].file_id + '/download_link.json');
    return { download: { url: links[0].URI, fileName: main[0].file_name, modName: mod.name, source: newNexusSource(modId, main[0], mod) } };
  } catch (e) { status('Nexus: ' + e.message + ' Opened the Files tab instead.', 'amber'); return { browse: filesPage }; }
}
function findNexusSources(mods, extraDirs) {
  const cands = [];
  for (const d of [J(C.dataDir(), 'downloads'), ...(extraDirs || [])]) { if (!isDir(d)) continue; for (const n of fs.readdirSync(d)) if (/\.(zip|rar|7z|oiv)$/i.test(n)) { try { cands.push({ name: n, mtime: fs.statSync(path.join(d, n)).mtimeMs }); } catch (e) { /* */ } } }
  let changed = false;
  for (const m of mods) {
    if (C.modSource(m)) continue;
    const want = lc(C.cleanName(m.Name)).replace(/[^a-z0-9]/g, ''); if (!want) continue;
    for (const c of cands) {
      const nx = P.nexusFromName(c.name); if (!nx) continue;
      const have = lc(C.cleanName(nx.Name)).replace(/[^a-z0-9]/g, '');
      if (have && (have === want || want.includes(have) || have.includes(want))) { m.Source = Object.assign(nx.Source, { InstalledAt: Math.floor(c.mtime / 1000), Update: '' }); changed = true; break; }
    }
  }
  return changed;
}
async function checkUpdates(downloadsDir) {
  if (!(await loadTokens())) return { needLogin: true };
  const mods = C.loadDb();
  const changed = findNexusSources(mods, downloadsDir ? [downloadsDir] : []);
  const nx = mods.filter(m => C.modSource(m) && C.modSource(m).NexusId);
  if (!nx.length) { if (changed) C.saveDb(mods); return { none: true }; }
  const found = [];
  for (let i = 0; i < nx.length; i++) {
    const m = nx[i], src = C.modSource(m);
    status('Checking for updates (' + (i + 1) + ' of ' + nx.length + '): ' + m.Name + '...', 'dim');
    try {
      const info = await nexus('games/' + P.NEXUS_GAME + '/mods/' + src.NexusId + '.json');
      const files = await nexus('games/' + P.NEXUS_GAME + '/mods/' + src.NexusId + '/files.json');
      const main = mainFiles(files.files);
      if (info.picture_url) src.Picture = String(info.picture_url);
      let nw = '';
      if (main.length) {
        const top = main[0];
        const since = Number(src.Uploaded) > 0 ? Number(src.Uploaded) : Number(src.InstalledAt || 0);
        const sameFile = src.FileId && String(top.file_id) === String(src.FileId);
        const sameVer = src.Version && top.version && verKey(top.version) === verKey(src.Version);
        if (!sameFile && !sameVer && Number(top.uploaded_timestamp) > since) { nw = top.version ? String(top.version) : 'new'; src.LatestFileId = String(top.file_id); found.push(m); }
      }
      src.Update = nw;
      if (!isFile(P.thumbPath(m.Name)) && src.Picture) { try { await P.saveThumbFromUrl(m.Name, src.Picture); } catch (e) { /* */ } }
    } catch (e) { /* */ }
  }
  C.saveDb(mods);
  if (!found.length) { status('All ' + nx.length + ' Nexus mod(s) are up to date.', 'green'); return { found: [] }; }
  status(found.length + ' update(s) available.', 'green');
  return { found: found.map(m => ({ name: m.Name, from: C.modSource(m).Version || '?', to: C.modSource(m).Update })) };
}
// one update: Premium = direct download; free = the Files page opens
async function updateDownload(name) {
  const m = C.loadDb().find(x => x.Name === name); const src = C.modSource(m);
  if (!src || !src.NexusId) return null;
  const me = await nexus('users/validate.json');
  if (!me.is_premium) { status("Free Nexus account: on the page that opened, click 'Mod Manager Download' (or Manual Download). The app installs it over '" + name + "'.", 'amber'); return { browse: 'https://www.nexusmods.com/' + P.NEXUS_GAME + '/mods/' + src.NexusId + '?tab=files', stop: true }; }
  let fid = src.LatestFileId || '', info;
  if (!fid) { const files = await nexus('games/' + P.NEXUS_GAME + '/mods/' + src.NexusId + '/files.json'); info = mainFiles(files.files)[0]; fid = String(info.file_id); }
  else info = await nexus('games/' + P.NEXUS_GAME + '/mods/' + src.NexusId + '/files/' + fid + '.json');
  const mod = await nexus('games/' + P.NEXUS_GAME + '/mods/' + src.NexusId + '.json');
  const links = await nexus('games/' + P.NEXUS_GAME + '/mods/' + src.NexusId + '/files/' + fid + '/download_link.json');
  return { download: { url: links[0].URI, fileName: info.file_name, modName: name, source: newNexusSource(src.NexusId, info, mod) } };
}

// ================================================================ downloads (with progress)
let downloading = false;
async function download(url, fileName, label) {
  if (downloading) throw friendly('Another download is still on its way. Wait for it to finish.');
  downloading = true;
  try {
    const dir = J(C.dataDir(), 'downloads'); fs.mkdirSync(dir, { recursive: true });
    if (!fileName) fileName = 'mod_' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15) + '.zip';
    fileName = fileName.replace(/[\\/:*?"<>|]/g, '_');
    const dest = path.join(dir, fileName);
    status('Download started...', 'dim');
    const res = await fetch(url, { headers: { 'User-Agent': 'LibertyCityModLoaderIV/1.0' }, redirect: 'follow' });
    if (!res.ok) throw friendly('Download failed: ' + res.status + ' ' + res.statusText);
    const total = Number(res.headers.get('content-length') || 0);
    const out = fs.createWriteStream(dest + '.part');
    let got = 0, last = 0, lastBytes = 0, lastTick = Date.now(), speed = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      got += value.length;
      if (!out.write(Buffer.from(value))) await new Promise(r => out.once('drain', r));
      const now = Date.now();
      if (now - last >= 250) {
        last = now; const dt = (now - lastTick) / 1000;
        if (dt >= 1) { speed = (got - lastBytes) / 1048576 / dt; lastBytes = got; lastTick = now; }
        const pct = total ? Math.round(100 * got / total) + '%   ' : '';
        status('Downloading ' + (label || fileName) + '   ' + pct + (got / 1048576).toFixed(1) + (total ? ' of ' + (total / 1048576).toFixed(1) : '') + ' MB' + (speed ? '   -   ' + speed.toFixed(2) + ' MB/s' : ''), 'text');
      }
    }
    await new Promise((r, j) => out.end(e => e ? j(e) : r()));
    if (exists(dest)) fs.rmSync(dest, { force: true });
    fs.renameSync(dest + '.part', dest);
    status('Downloaded ' + fileName + '.', 'green');
    return dest;
  } finally { downloading = false; }
}

// ================================================================ essentials, Fusion Fix settings, storage
const ffIni = () => J(E.game, 'plugins\\GTAIV.EFLC.FusionFix.ini');
function ffIniValue(key) {
  const p = ffIni(); if (!isFile(p)) return null;
  const re = new RegExp('^\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*([^\\s/;]*)');
  for (const l of readLines(p)) { const m = re.exec(l); if (m) return m[1]; }
  return null;
}
function setFFIniValue(key, value) {
  const p = ffIni(); if (!isFile(p)) return false;
  const lines = readLines(p); const re = new RegExp('^(\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*)([^\\s/;]*)(.*)$');
  for (let i = 0; i < lines.length; i++) { const m = re.exec(lines[i]); if (m) { lines[i] = m[1] + value + m[3]; fs.writeFileSync(p, lines.join('\r\n') + '\r\n', 'latin1'); return true; } }
  return false;
}
function fileVersion(p) {
  try {
    const b = fs.readFileSync(p);
    const key = Buffer.from('ProductVersion\0', 'utf16le'); let at = b.indexOf(key); if (at < 0) return '';
    at += key.length; while (b[at] === 0) at++;
    let s = ''; for (let i = at; i + 1 < b.length; i += 2) { const c = b.readUInt16LE(i); if (!c) break; s += String.fromCharCode(c); if (s.length > 40) break; }
    return s.trim();
  } catch (e) { return ''; }
}
function essentials() {
  if (!E.game) return null;
  const v = P.gameVersion();
  const ffAsi = J(E.game, 'plugins\\GTAIV.EFLC.FusionFix.asi');
  const vb = ffIniValue('VehicleBudget');
  return {
    version: v ? P.verText(v) : '', complete: P.isCompleteEdition(),
    fusionFix: isFile(ffAsi), fusionFixVersion: isFile(ffAsi) ? fileVersion(ffAsi) : '',
    vehicleBudget: vb, scriptHookDotNet: exists(J(E.game, 'ScriptHookDotNet.asi')) || exists(J(E.game, 'plugins\\ScriptHookDotNet.asi')),
    dlss: exists(J(E.game, 'DLSS-IV.asi')) || exists(J(E.game, 'plugins\\DLSS-IV.asi')),
    sevenZip: !!P.find7z(),
  };
}
function bumpVehicleBudget() {
  const vb = ffIniValue('VehicleBudget');
  const nw = (vb === '0' || vb === '' || vb == null) ? '144000000' : String(Number(vb) + 20000000);
  return nw;
}
function storage() {
  const dl = J(C.dataDir(), 'downloads'); let b = 0;
  if (isDir(dl)) for (const n of fs.readdirSync(dl)) { try { const st = fs.statSync(path.join(dl, n)); if (st.isFile()) b += st.size; } catch (e) { /* */ } }
  return { downloadsMB: Math.round(b / 104857.6) / 10, folder: dl };
}
function clearDownloads() { const dl = J(C.dataDir(), 'downloads'); if (isDir(dl)) for (const n of fs.readdirSync(dl)) { const p = path.join(dl, n); if (isFile(p)) rm(p); } status('Downloaded files cleared.', 'green'); }

// ================================================================ My Mods list for the window
function myMods() {
  if (!E.game) return [];
  const mods = C.loadDb(), data = C.dataDir();
  return mods.map((m, i) => {
    let repl = 0, miss = 0;
    if (C.inLib(m)) {
      for (const f of m.Files || []) { if (!f || String(f).includes('|')) continue; if (isFile(J(data, 'replaced', f))) repl++; if (!isFile(C.libFile(m.Name, f))) miss++; }
      if (C.modArchives(m).length && C.isOn(m) && !isDir(J(E.game, C.ARCHIVE_DIR))) miss++;
    } else {
      repl = (m.Backups || []).length;
      if (C.isOn(m)) { const ai = C.modArchives(m).map(a => String(a.Inner)); for (const f of m.Files || []) if (f && !ai.includes(f) && !exists(J(E.game, f))) miss++; }
    }
    const s = C.modSource(m);
    let thumb = null; try { const tp = P.thumbPath(m.Name); if (isFile(tp)) thumb = 'data:image/png;base64,' + fs.readFileSync(tp).toString('base64'); } catch (e) { /* */ }
    return {
      name: m.Name, order: i, on: C.isOn(m), date: m.Date || '', files: (m.Files || []).length + C.modArchives(m).length, replaced: repl, missing: miss,
      found: !!m.Found, version: s && s.Version ? String(s.Version) : (s && s.NexusId ? 'Nexus' : ''), update: s && s.Update ? String(s.Update) : '',
      url: s ? String(s.Url || '') : '', nexusId: s ? String(s.NexusId || '') : '', archives: C.modArchives(m).length, thumb,
      fileList: [...(m.Files || []), ...C.modArchives(m).map(a => leaf(a.Archive) + ' > ' + String(a.Inner).replace(/^\?/, ''))],
    };
  });
}

module.exports = {
  startNoMods, stopTroubleshoot, startFindBroken, answerFindBroken, tsState, conflictCheck,
  findExternalMods, addFoundMods, clearFound, tidyFoundMods, findLeftovers, cleanLeftovers,
  listArchives, archiveFiles, findInGameArchives, takeOut, replacePlan, addFilesPlan, openModel, openTextures, texturePixels, replaceTexture, textureLevels, finishTextures, closeTextures,
  exportModList, importModList, loadSettings, saveSettings, nexusLogin, nexusLoginCancel, nexusLogout, nexusAccount, nxmToDownload, nexusPageToDownload, checkUpdates, updateDownload, download,
  essentials, ffIniValue, setFFIniValue, bumpVehicleBudget, storage, clearDownloads, myMods,
};
