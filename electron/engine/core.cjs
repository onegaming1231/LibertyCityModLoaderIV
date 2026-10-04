'use strict';
// The heart of the app: the mod library, putting files in the game, combining data files, texture mixing,
// and modded copies of game archives. Ported 1:1 from the PowerShell version (same files on disk, so
// everything installed with the old version keeps working).
const fs = require('fs');
const path = require('path');
const F = require('./formats.cjs');

const E = {
  game: '',
  host: {                                          // filled in by the process that runs the engine
    status: (text, color) => {},                   // color: dim | green | amber | red | text
    ask: async (message, title, buttons) => buttons ? buttons[0] : 'Yes',
    trash: (p) => { try { fs.rmSync(p, { force: true }); } catch (e) { /* */ } },
    image: async () => null,
    log: () => {},
  },
};
const status = (t, c) => { try { E.host.status(t, c || 'text'); } catch (e) { /* */ } };

// ---------------------------------------------------------------- paths (game paths are stored with "\")
const SEP = path.sep;
const toOs = (p) => String(p).replace(/[\\/]+/g, SEP);
const J = (...parts) => toOs(path.join(...parts.map(p => toOs(p))));
const leaf = (rel) => String(rel).split(/[\\/]/).pop();
const parentRel = (rel) => { const s = String(rel).split('\\'); s.pop(); return s.join('\\'); };
const exists = (p) => { try { fs.accessSync(p); return true; } catch (e) { return false; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const mkParent = (p) => fs.mkdirSync(path.dirname(p), { recursive: true });
const rm = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* */ } };
const readText = (p) => { let s = fs.readFileSync(p, 'utf8'); if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1); return s; };
const readLines = (p) => readText(p).split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === ''));
const readJson = (p, def) => { try { return JSON.parse(readText(p)); } catch (e) { return def; } };
const writeJson = (p, o) => { mkParent(p); fs.writeFileSync(p, JSON.stringify(o, null, 2), 'utf8'); };
const lc = (s) => String(s == null ? '' : s).toLowerCase();
const eqI = (a, b) => lc(a) === lc(b);
function walkFiles(dir, out = [], depth = 99) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const d of ents) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) { if (depth > 0) walkFiles(p, out, depth - 1); } else if (d.isFile()) out.push(p);
  }
  return out;
}
const relOf = (full, base) => full.substring(base.length).replace(/^[\\/]+/, '').split(SEP).join('\\');
const appendLog = (name, line) => { try { fs.appendFileSync(J(dataDir(), name), new Date().toISOString().slice(0, 19) + '  ' + line + '\r\n'); } catch (e) { /* */ } };

const ROOTS = ['pc', 'common', 'tlad', 'tbogt', 'movies'];

// ---------------------------------------------------------------- data folder and mod list
let dataDirCache = null, dataDirOf = null;
function dataDir() {
  if (dataDirOf === E.game && dataDirCache && isDir(dataDirCache)) return dataDirCache;
  const d = J(E.game, 'LCModInstaller'); fs.mkdirSync(d, { recursive: true });
  dataDirCache = d; dataDirOf = E.game; return d;
}
const dbPath = () => J(dataDir(), 'mods.json');
let dbCache = null, dbSig = '', dbCachePath = '';
const sigOf = (p) => { try { const s = fs.statSync(p); return s.size + '|' + s.mtimeMs; } catch (e) { return ''; } };
function loadDb() {
  const p = dbPath();
  if (!exists(p)) return [];
  const sig = sigOf(p);
  if (dbCache && dbCachePath === p && dbSig === sig) return JSON.parse(JSON.stringify(dbCache));
  let list = readJson(p, []);
  if (!Array.isArray(list)) list = list ? [list] : [];
  for (const m of list) { if (m && !Array.isArray(m.Files)) m.Files = m.Files ? [m.Files] : []; if (m && m.Archives && !Array.isArray(m.Archives)) m.Archives = [m.Archives]; }
  dbCache = list; dbCachePath = p; dbSig = sig;
  return JSON.parse(JSON.stringify(list));
}
function saveDb(mods) {
  const p = dbPath();
  fs.writeFileSync(p, JSON.stringify(mods, null, 2), 'utf8');
  dbCache = JSON.parse(JSON.stringify(mods)); dbCachePath = p; dbSig = sigOf(p);
}
const isOn = (m) => !(m && m.Enabled === false);
const inLib = (m) => !!(m && m.Library);
const libFile = (name, rel) => J(dataDir(), 'library', name, rel);
const replacedFile = (rel) => J(dataDir(), 'replaced', rel);
const deployedPath = () => J(dataDir(), 'deployed.json');
function loadDeployed() { const h = {}; const o = readJson(deployedPath(), {}); for (const k of Object.keys(o || {})) h[lc(k)] = String(o[k]); return h; }
function saveDeployed(h) { const o = {}; for (const k of Object.keys(h).sort()) o[k] = h[k]; try { writeJson(deployedPath(), o); } catch (e) { /* */ } }
function getOwner(rel, mods) { for (const m of mods) { if (!isOn(m)) continue; for (const f of m.Files || []) if (eqI(f, rel)) return m.Name; } return null; }
const modArchives = (m) => (m && Array.isArray(m.Archives) ? m.Archives.filter(Boolean) : []);
const modSource = (m) => (m && m.Source ? m.Source : null);
const modPath = (m, rel) => inLib(m) ? libFile(m.Name, rel) : J(E.game, rel);
function cleanName(s) { return String(s || '').replace(/[^A-Za-z0-9 _\-.]/g, '').replace(/\s+/g, ' ').trim(); }
const allModFiles = (mods) => [...new Set(mods.flatMap(m => m.Files || []).filter(Boolean).map(String))].sort();

// a copy of $from at $to (a hard link when it can, otherwise a normal copy)
function placeFile(from, to) {
  if (exists(to)) fs.rmSync(to, { force: true });
  mkParent(to);
  try { fs.linkSync(from, to); } catch (e) { fs.copyFileSync(from, to); }
}
function sameFile(a, b) { try { const x = fs.statSync(a), y = fs.statSync(b); return x.size === y.size && Math.floor(x.mtimeMs) === Math.floor(y.mtimeMs); } catch (e) { return false; } }
// removes folders a mod left empty (never the game folder itself or its main folders)
function removeEmptyDirs(start) {
  let d = start;
  while (d && d.length > E.game.length) {
    const lf = lc(path.basename(d));
    if (path.dirname(d) === E.game && ['update', 'scripts', 'plugins', 'pc', 'common', 'tlad', 'tbogt'].includes(lf)) break;
    let empty = false; try { empty = fs.readdirSync(d).length === 0; } catch (e) { break; }
    if (empty) { try { fs.rmdirSync(d); } catch (e) { break; } d = path.dirname(d); } else break;
  }
}
// a file no mod put there goes to the Recycle Bin (moved out of the way first, so the new file can take its place)
function trash(p) {
  const tmp = J(dataDir(), 'temp', 'recycle-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), path.basename(p));
  mkParent(tmp);
  try { fs.renameSync(p, tmp); E.host.trash(tmp); } catch (e) { rm(p); }
}

// the file the game actually sees, whichever update subfolder it sits in
function gamePath(rel) {
  const s = String(rel).split('\\');
  if (lc(s[0]) !== 'update' || s.length < 3) return lc(rel);
  if (ROOTS.includes(lc(s[1]))) return lc(s.slice(1).join('\\'));
  return lc(s.slice(2).join('\\'));
}
function fileIndex(mods) {
  const ix = new Map();
  mods.forEach((m, i) => { for (const f of m.Files || []) { if (!f) continue; const k = lc(f); if (!ix.has(k)) ix.set(k, []); ix.get(k).push(i); } });
  return ix;
}
// the mod whose version of this file should be in the game now (on, and lowest in the list)
function getWinner(rel, mods, ix) {
  ix = ix || fileIndex(mods);
  const list = ix.get(lc(rel)); if (!list) return null;
  for (let j = list.length - 1; j >= 0; j--) { const m = mods[list[j]]; if (isOn(m) && inLib(m) && isFile(libFile(m.Name, rel))) return m; }
  return null;
}

// ---------------------------------------------------------------- archives the app builds
const ARCHIVE_DIR = 'update\\LC Installer Archives';
const DATA_DIR = 'update\\LC Installer Data';
function builtArchives(mods) { const h = new Set(); for (const m of mods) if (isOn(m)) for (const it of modArchives(m)) h.add(lc(it.Archive)); return h; }
const isWholeArchiveCopy = (rel) => /^update\\/i.test(rel) && !/^update\\LC Installer Archives\\/i.test(rel) && /\.(rpf|img)$/i.test(rel);

// ---------------------------------------------------------------- data lists (gta.dat, images.txt, default.dat) + keyed car/ped data
const KEYED = {
  'common\\data\\handling.dat': 'handling', 'common\\data\\vehicles.ide': 'ide:cars', 'common\\data\\peds.ide': 'ide:peds',
  'common\\data\\carcols.dat': 'ide:', 'common\\data\\cargrp.dat': 'grp', 'common\\data\\pedgrp.dat': 'grp',
};
const MERGE_TARGETS = ['common\\data\\gta.dat', 'common\\data\\images.txt', 'common\\data\\default.dat', ...Object.keys(KEYED)];
const LINE_FILES = {}; for (const t of MERGE_TARGETS) LINE_FILES[leaf(t)] = t;
function isMergeCopy(rel) {
  if (!/^update\\/i.test(rel) || /^update\\LC Installer (Data|Archives)\\/i.test(rel)) return false;
  if (/^update\\(common|pc|tlad|tbogt)\\/i.test(rel)) return false;   // the combined file itself
  return MERGE_TARGETS.includes(gamePath(rel));
}
// data files must sit at their real path in update\ - Fusion Fix doesn't read them from a mod's own folder
function isDataPath(gp) { gp = lc(gp); return /^(tlad\\|tbogt\\)?(common|pc)\\data\\/.test(gp) && !MERGE_TARGETS.includes(gp); }
function updateDest(mod, gp) { return isDataPath(gp) ? 'update\\' + gp : 'update\\' + mod + '\\' + gp; }
const lineKey = (l) => lc(String(l).trim().replace(/\s+/g, ' '));
function lineTargetOk(line, known) {
  const m = /(common|platform|pc):\/([^\s,]+)/i.exec(line);
  if (!m) return true;
  const root = lc(m[1]) === 'common' ? 'common' : 'pc';
  const p = lc(root + '\\' + m[2].replace(/\//g, '\\'));
  for (const c of [p, p + '.img', p + '.ide', p + '.ipl', p + '.wpl', p + '.dat']) if (known.has(c) || isFile(J(E.game, c))) return true;
  return false;
}
function keyedKey(kind, t) {
  if (kind === 'handling') { const tk = t.split(/\s+/); if (/^[%!$^]$/.test(tk[0]) && tk.length > 1) return lc(tk[0] + ' ' + tk[1]); return lc(tk[0]); }
  return lc(t.split(',')[0].trim().split(/\s+/)[0]);
}
function findSection(lines, name) {
  for (let i = 0; i < lines.length; i++) {
    if (eqI(String(lines[i]).trim(), name)) { for (let j = i + 1; j < lines.length; j++) if (eqI(String(lines[j]).trim(), 'end')) return [i, j]; return [i, lines.length]; }
  }
  return null;
}
// puts one mod's lines into the combined file: same car/ped = replaced, new = added in its section
function mergeKeyed(kind, lines, srcPath, defSection) {
  let changed = 0, sec = defSection;
  for (const raw of readLines(srcPath)) {
    const t = raw.trim(); if (!t) continue;
    if (kind === 'handling') {
      if (t.startsWith(';') || t.startsWith('#')) continue;
      if (t.split(/\s+/).length < 10) continue;
      const k = keyedKey(kind, t); let at = -1, lastData = -1, lastSame = -1;
      const pre = /[%!$^]/.test(t[0]) ? t[0] : '';
      for (let i = 0; i < lines.length; i++) {
        const b = String(lines[i]).trim();
        if (!b || b.startsWith(';') || b.startsWith('#')) continue;
        lastData = i;
        if ((/[%!$^]/.test(b[0]) ? b[0] : '') === pre) lastSame = i;
        if (at < 0 && keyedKey(kind, b) === k) at = i;
      }
      if (at >= 0) { if (String(lines[at]).trim() !== t) { lines[at] = t; changed++; } }
      else { lines.splice((lastSame >= 0 ? lastSame : lastData) + 1, 0, t); changed++; }
      continue;
    }
    if (kind === 'grp') {
      const h = t.indexOf('#'); if (h < 1) continue;
      const label = t.substring(h + 1).trim().split(/\s+/)[0]; if (!label) continue;
      const names = t.substring(0, h).split(',').map(s => s.trim()).filter(s => /^[A-Za-z0-9_]+$/.test(s));
      if (!names.length) continue;
      for (let i = 0; i < lines.length; i++) {
        const b = String(lines[i]); const bh = b.indexOf('#'); if (bh < 1) continue;
        if (!eqI(b.substring(bh + 1).trim().split(/\s+/)[0], label)) continue;
        const have = b.substring(0, bh).split(',').map(s => lc(s.trim()));
        const nw = names.filter(n => !have.includes(lc(n)));
        if (nw.length) { lines[i] = nw.join(', ') + ', ' + b.replace(/^\s+/, ''); changed++; }
        break;
      }
      continue;
    }
    if (t.startsWith('#')) continue;
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(t)) { sec = eqI(t, 'end') ? defSection : lc(t); continue; }
    const k = keyedKey(kind, t);
    let useSec = sec;
    if (!useSec) {
      const nums = t.split(',').slice(1).filter(s => /^\d+$/.test(s.trim())).length;
      useSec = nums > 0 && nums % 4 === 0 ? 'car4' : 'car3';
      for (const cand of ['car3', 'car4']) {
        const r = findSection(lines, cand);
        if (r) for (let i = r[0] + 1; i < r[1]; i++) { const b = String(lines[i]).trim(); if (b && !b.startsWith('#') && keyedKey(kind, b) === k) useSec = cand; }
      }
    }
    const r = findSection(lines, useSec);
    if (!r) { lines.push('', useSec, t, 'end'); changed++; continue; }
    let at = -1;
    for (let i = r[0] + 1; i < r[1]; i++) {
      const b = String(lines[i]).trim(); if (!b || b.startsWith('#')) continue;
      if (useSec === 'col') { if (lineKey(b) === lineKey(t)) { at = i; break; } continue; }
      if (keyedKey(kind, b) === k) { at = i; break; }
    }
    if (at >= 0) { if (String(lines[at]).trim() !== t) { lines[at] = t; changed++; } }
    else { lines.splice(r[1], 0, t); changed++; }
  }
  return changed;
}
function rebuildMerges(mods) {
  if (!E.game) return;
  mods = mods || loadDb();
  const outRoot = J(E.game, 'update');
  const oldRoot = J(E.game, DATA_DIR); if (exists(oldRoot)) rm(oldRoot);
  const mark = J(dataDir(), 'merged.txt');
  const ours = new Set(); if (isFile(mark)) for (const l of readLines(mark)) if (l) ours.add(lc(l));
  let known = null;
  for (const target of MERGE_TARGETS) {
    let srcs = [];
    for (const m of mods) {
      if (!isOn(m)) continue;
      for (const f of (m.Files || []).filter(f => f && isMergeCopy(String(f)) && gamePath(String(f)) === target)) {
        const p = modPath(m, String(f)); if (isFile(p)) srcs.push({ mod: m.Name, path: p });
      }
    }
    const out = J(outRoot, target), orig = J(E.game, target), keepRp = replacedFile('update\\' + target);
    if (!srcs.length || !isFile(orig)) {
      if (ours.has(target) && isFile(out)) { fs.rmSync(out, { force: true }); removeEmptyDirs(path.dirname(out)); }
      if (ours.has(target) && KEYED[target] && isFile(keepRp)) { mkParent(out); fs.renameSync(keepRp, out); }
      ours.delete(target); continue;
    }
    if (!known) { known = new Set(); for (const mm of mods) if (isOn(mm)) for (const f of mm.Files || []) if (f) known.add(gamePath(String(f))); }
    let lines = [], skipped = [];
    if (KEYED[target]) {
      if (!ours.has(target) && isFile(out) && !isFile(keepRp)) { mkParent(keepRp); fs.copyFileSync(out, keepRp); }
      lines = readLines(isFile(keepRp) ? keepRp : orig);
      const def = KEYED[target]; const kind = def.split(':')[0]; const sec = def.includes(':') ? def.split(':')[1] : '';
      for (const s of srcs) { try { mergeKeyed(kind, lines, s.path, sec); } catch (e) { skipped.push(s.mod + ': ' + e.message); } }
      srcs = [];
    } else lines = readLines(orig);
    const have = new Set(lines.map(lineKey));
    for (const s of srcs) {
      for (const l of readLines(s.path)) {
        const k = lineKey(l);
        if (!k || k.startsWith('#') || have.has(k)) continue;
        if (!lineTargetOk(l, known)) { skipped.push(s.mod + ': ' + l.trim()); continue; }
        const kw = l.trim().split(/\s+/)[0]; let at = -1;
        for (let i = lines.length - 1; i >= 0; i--) if (eqI(String(lines[i]).trim().split(/\s+/)[0], kw)) { at = i; break; }
        if (at >= 0) lines.splice(at + 1, 0, l.trim()); else lines.push(l.trim());
        have.add(k);
      }
    }
    mkParent(out);
    const text = lines.join('\r\n') + '\r\n';
    let cur = null; try { cur = fs.readFileSync(out, 'latin1'); } catch (e) { /* */ }
    if (cur !== text) { if (exists(out)) fs.rmSync(out, { force: true }); fs.writeFileSync(out, text, 'latin1'); }
    ours.add(target);
    if (skipped.length) appendLog('merges.log', 'left out (file not found): ' + skipped.join(' | '));
  }
  try { fs.writeFileSync(mark, [...ours].join('\r\n') + (ours.size ? '\r\n' : '')); } catch (e) { /* */ }
}

// ---------------------------------------------------------------- trainer lists (Liberty's Legacy add-on lists)
function ideNames(p, section) {
  const names = []; let inSec = false;
  for (const l of readLines(p)) {
    const t = l.trim(); if (!t || t.startsWith('#')) continue;
    if (!inSec) { if (eqI(t, section)) inSec = true; continue; }
    if (eqI(t, 'end')) { inSec = false; continue; }
    const n = t.split(',')[0].trim(); if (/^[A-Za-z0-9_]+$/.test(n)) names.push(n);
  }
  return names;
}
function updateTrainerLists(mods) {
  if (!E.game) return;
  const ll = J(E.game, "Liberty's Legacy", 'Lists'); if (!isDir(ll)) return;
  mods = mods || loadDb();
  const base = { peds: new Set(), cars: new Set() };
  for (const ep of ['', 'tlad\\', 'tbogt\\']) for (const [sec, file] of [['peds', 'peds.ide'], ['cars', 'vehicles.ide']]) {
    const bf = J(E.game, ep + 'common\\data\\' + file); if (isFile(bf)) { try { for (const n of ideNames(bf, sec)) base[sec].add(lc(n)); } catch (e) { /* */ } }
  }
  const want = { peds: [], cars: [] };
  for (const m of mods) {
    if (!isOn(m)) continue;
    for (const f of (m.Files || []).filter(f => /\.ide$/i.test(String(f)))) {
      const p = modPath(m, String(f)); if (!isFile(p)) continue;
      for (const sec of ['peds', 'cars']) { try { for (const n of ideNames(p, sec)) if (!base[sec].has(lc(n)) && !want[sec].some(x => eqI(x, n))) want[sec].push(n); } catch (e) { /* */ } }
    }
  }
  const mark = J(dataDir(), 'trainer-added.txt');
  const ours = new Set(); if (isFile(mark)) for (const l of readLines(mark)) if (l) ours.add(lc(l));
  const newOurs = [];
  for (const [sec, file] of [['peds', 'addon_ped_models.txt'], ['cars', 'addon_vehicle_models.txt']]) {
    const lf = J(ll, file);
    let lines = isFile(lf) ? readLines(lf).map(s => s.trim()).filter(Boolean) : [];
    const before = lines.join('\n');
    lines = lines.filter(l => !(ours.has(sec + ':' + lc(l)) && !want[sec].some(x => eqI(x, l))));
    for (const n of want[sec]) {
      const k = sec + ':' + lc(n);
      if (lines.some(x => eqI(x, n))) { if (ours.has(k)) newOurs.push(k); continue; }
      lines.push(n); newOurs.push(k);
    }
    if (lines.join('\n') !== before) { try { fs.writeFileSync(lf, lines.join('\r\n') + (lines.length ? '\r\n' : '')); } catch (e) { /* */ } }
  }
  try { fs.writeFileSync(mark, newOurs.join('\r\n') + (newOurs.length ? '\r\n' : '')); } catch (e) { /* */ }
}

// ---------------------------------------------------------------- texture mixing (.wtd), picture by picture
const MIX_DIR = 'update\\LC Installer Textures';
const MIX_IMG = 'lcmixedtextures.img';
const isMixWtd = (rel) => /^update\\/i.test(rel) && !/^update\\LC Installer/i.test(rel) && /\.wtd$/i.test(rel);
function imgName(mod) { let n = lc(String(mod).replace(/[^A-Za-z0-9]/g, '')); if (n.length > 40) n = n.substring(0, 40); if (!n) n = 'models'; return n + '.img'; }
const isModImg = (m, rel) => eqI(rel, 'update\\' + m.Name + '\\' + imgName(m.Name));
function looseMixSets(mods) {
  const h = new Map();
  for (const m of mods) {
    if (!isOn(m) || !inLib(m)) continue;
    for (const f of (m.Files || []).filter(f => f && isMixWtd(String(f)))) {
      const p = libFile(m.Name, String(f)); if (!isFile(p)) continue;
      const gp = gamePath(String(f));
      if (!h.has(gp)) h.set(gp, []);
      if (h.get(gp).some(x => eqI(x.mod, m.Name))) continue;
      h.get(gp).push({ mod: m.Name, rel: String(f), path: p });
    }
  }
  for (const [k, v] of [...h]) if (v.length < 2) h.delete(k);
  return h;
}
const imgNamesCache = new Map();
function imgEntryNames(p) {
  let sig; try { const s = fs.statSync(p); sig = lc(p) + '|' + s.size + '|' + s.mtimeMs; } catch (e) { return []; }
  if (imgNamesCache.has(sig)) return imgNamesCache.get(sig);
  let names = []; try { names = F.img.read(p, null).map(e => e.name); } catch (e) { names = []; }
  imgNamesCache.set(sig, names); return names;
}
function imgMixSets(mods) {
  const h = new Map();
  for (const m of mods) {
    if (!isOn(m)) continue;
    for (const f of (m.Files || []).filter(f => f && isModImg(m, String(f)))) {
      const p = modPath(m, String(f)); if (!isFile(p)) continue;
      for (const n of imgEntryNames(p)) {
        if (!/\.wtd$/i.test(n)) continue;
        const k = lc(n); if (!h.has(k)) h.set(k, []);
        h.get(k).push({ mod: m.Name, rel: String(f), path: p, name: n });
      }
    }
  }
  for (const [k, v] of [...h]) if (v.length < 2) h.delete(k);
  return h;
}
const mixStatePath = () => J(dataDir(), 'texture-mix.json');
function loadMixState() { const o = readJson(mixStatePath(), {}); return { Sigs: Object.assign({}, o.Sigs || {}), Filtered: Object.assign({}, o.Filtered || {}) }; }
function saveMixState(st) { try { writeJson(mixStatePath(), st); } catch (e) { /* */ } }
const fileSig = (p) => { try { const s = fs.statSync(p); return s.size + '.' + Math.floor(s.mtimeMs); } catch (e) { return '-'; } };
function mixBase(gp) { for (const c of [J(E.game, 'update\\' + gp), J(E.game, gp)]) if (isFile(c)) return fs.readFileSync(c); return null; }
function imgMixBase(name) {
  try {
    const hit = findInArchives(name); if (!hit) return null;
    const arc = J(E.game, hit.Archive), key = archiveKey();
    if (/\.img$/i.test(hit.Archive)) return F.img.extract(arc, key, name);
    return F.rpf.extract(arc, key, hit.Inner);
  } catch (e) { return null; }
}
// mixes; if a file can't be read, the copy of the mod lowest in My Mods is used whole (like before)
function newMixedTexture(base, datas, what) {
  try { const r = F.Wtd.mix(base, datas); appendLog('texture-mix.log', 'mixed ' + what + '  ' + r.report); return r.data; }
  catch (e) { appendLog('texture-mix.log', what + ": couldn't mix (" + e.message + ") - the lowest mod's file is used"); return datas[datas.length - 1]; }
}
function writeFresh(p, bytes) { mkParent(p); if (exists(p)) fs.rmSync(p, { force: true }); fs.writeFileSync(p, bytes); }   // never write through a hard link
function rebuildTextureMixes(mods) {
  if (!E.game) return;
  mods = mods || loadDb();
  const st = loadMixState(), outRoot = J(E.game, MIX_DIR), keep = new Set();
  const loose = looseMixSets(mods);
  for (const [gp, set] of loose) {
    const out = J(outRoot, gp); keep.add(lc(gp));
    const sig = fileSig(J(E.game, 'update\\' + gp)) + '|' + fileSig(J(E.game, gp)) + '|' + set.map(s => s.mod + ':' + fileSig(s.path)).join('|');
    if (isFile(out) && st.Sigs[gp] === sig) continue;
    status('Mixing textures in ' + leaf(gp) + '...', 'dim');
    writeFresh(out, newMixedTexture(mixBase(gp), set.map(s => fs.readFileSync(s.path)), gp));
    st.Sigs[gp] = sig;
  }
  const imgSets = imgMixSets(mods), mixImg = J(outRoot, MIX_IMG);
  if (imgSets.size) {
    keep.add(MIX_IMG);
    const sig = [...imgSets].map(([k, v]) => k + '=' + v.map(s => s.mod + ':' + fileSig(s.path)).join(',')).join('|');
    if (!isFile(mixImg) || st.Sigs[MIX_IMG] !== sig) {
      status('Mixing textures from your mods...', 'dim');
      const entries = [];
      for (const [, set] of imgSets) {
        const datas = set.map(s => F.img.extract(s.path, null, s.name)).filter(Boolean);
        if (!datas.length) continue;
        entries.push({ name: set[0].name, data: newMixedTexture(imgMixBase(set[0].name), datas, set[0].name) });
      }
      if (exists(mixImg)) fs.rmSync(mixImg, { force: true });
      F.img.write(mixImg, entries);
      st.Sigs[MIX_IMG] = sig;
    }
  }
  // the mods' own .img in the game: without the textures that are in the mixed .img
  const dep = loadDeployed();
  for (const m of mods) {
    for (const f of (m.Files || []).filter(f => f && isModImg(m, String(f)))) {
      const rel = String(f), key = lc(rel), dest = J(E.game, rel), lib = modPath(m, rel);
      if (!inLib(m) || !isFile(lib)) continue;
      const on = isOn(m) && dep[key] && eqI(dep[key], m.Name);
      const skip = on ? imgEntryNames(lib).filter(n => imgSets.has(lc(n))) : [];
      const skipKey = skip.map(lc).sort().join(',');
      if (skip.length) {
        const full = isFile(dest) && sameFile(dest, lib);
        if (!full && st.Filtered[key] === skipKey) continue;
        const rest = F.img.readAll(lib, null).filter(e => !skip.some(s => eqI(s, e.name)));
        if (exists(dest)) fs.rmSync(dest, { force: true });
        if (rest.length) F.img.write(dest, rest);
        st.Filtered[key] = skipKey;
      } else if (st.Filtered[key] !== undefined) {
        if (on && !(isFile(dest) && sameFile(dest, lib))) { try { placeFile(lib, dest); } catch (e) { /* */ } }
        delete st.Filtered[key];
      }
    }
  }
  if (isDir(outRoot)) {
    for (const old of walkFiles(outRoot)) {
      const rel = lc(relOf(old, outRoot));
      if (!keep.has(rel)) { rm(old); delete st.Sigs[rel]; removeEmptyDirs(path.dirname(old)); }
    }
    if (!walkFiles(outRoot).length) rm(outRoot);
  }
  for (const k of Object.keys(st.Sigs)) if (!keep.has(lc(k))) delete st.Sigs[k];
  saveMixState(st);
}
// two mods changing the same texture file inside a game archive: one mixed file goes in
function mixArchiveTextures(arc, orig, key, inner, srcs) {
  const groups = new Map();
  inner.forEach((x, i) => { const k = lc(x); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  const ni = [], ns = [], mixRoot = J(dataDir(), 'texture-mix', arc), made = new Set();
  for (const [k, ix] of groups) {
    const paths = ix.map(i => srcs[i]).filter(isFile);
    if (/\.wtd$/.test(k) && paths.length >= 2) {
      let base = null; if (!k.startsWith('?')) { try { base = F.rpf.extract(orig, key, inner[ix[0]]); } catch (e) { base = null; } }
      const bytes = newMixedTexture(base, paths.map(p => fs.readFileSync(p)), arc + ' > ' + inner[ix[0]]);
      const out = J(mixRoot, k.replace(/^\?/, '').replace(/[/\\:]/g, '_'));
      writeFresh(out, bytes); made.add(lc(out));
      ni.push(inner[ix[0]]); ns.push(out);
    } else for (const j of ix) { ni.push(inner[j]); ns.push(srcs[j]); }
  }
  if (isDir(mixRoot)) for (const f of fs.readdirSync(mixRoot)) { const p = J(mixRoot, f); if (!made.has(lc(p))) rm(p); }
  return { inner: ni, srcs: ns };
}

// ---------------------------------------------------------------- putting files in the game
// Shader files in Fusion Fix's own folder always win (old shader mods make people invisible). Else: lower in My Mods wins.
const copyRank = (rel) => (/^update\\common\\shaders\\/i.test(rel) && /\.fxc$/i.test(rel)) ? 1 : 0;
function syncFiles(rels, mods) {
  mods = mods || loadDb();
  const dep = loadDeployed();
  const byName = new Map(mods.map(m => [lc(m.Name), m]));
  const ix = fileIndex(mods), built = builtArchives(mods), mixLoose = looseMixSets(mods);
  const gpOwners = new Map(), atOf = new Map();
  mods.forEach((m, i) => atOf.set(lc(m.Name), i));
  mods.forEach((om, mi) => {
    if (!inLib(om)) return;
    for (const f of om.Files || []) {
      const fr = String(f || '');
      if (!fr || !/^update\\/i.test(fr) || /^update\\LC Installer/i.test(fr)) continue;
      const g = gamePath(fr); if (!gpOwners.has(g)) gpOwners.set(g, []);
      gpOwners.get(g).push({ at: mi, rel: fr, mod: om });
    }
  });
  let list = (rels || []).filter(Boolean).map(String);
  const more = [];
  for (const r of list) if (/^update\\/i.test(r)) { const g = gamePath(r); if (gpOwners.has(g)) more.push(...gpOwners.get(g).map(o => o.rel)); }
  const seen = new Set(); list = [...list, ...more].filter(r => { const k = lc(r); if (seen.has(k)) return false; seen.add(k); return true; });
  for (const rel of list) {
    if (rel.includes('|')) continue;
    const key = lc(rel), dest = J(E.game, rel);
    let winner = getWinner(rel, mods, ix);
    if (winner && isWholeArchiveCopy(rel) && built.has(gamePath(rel))) winner = null;
    if (winner && isMergeCopy(rel)) winner = null;
    if (winner && isMixWtd(rel) && mixLoose.has(gamePath(rel))) winner = null;
    if (winner && /^update\\/i.test(rel) && !/^update\\LC Installer/i.test(rel)) {
      const g = gamePath(rel);
      if (gpOwners.has(g)) {
        const wAt = atOf.get(lc(winner.Name)), wPr = copyRank(rel);
        for (const o of gpOwners.get(g)) {
          if (eqI(o.rel, rel) || !isOn(o.mod) || !isFile(libFile(o.mod.Name, o.rel))) continue;
          const oPr = copyRank(o.rel);
          if (oPr > wPr || (oPr === wPr && o.at > wAt)) { winner = null; break; }
        }
      }
    }
    const cur = dep[key] || null;
    const curMod = cur ? byName.get(lc(cur)) : null;
    let there = isFile(dest);
    if (there && curMod) {
      // settings you changed in the game folder (.ini and friends) are kept in that mod's copy
      const lf = libFile(curMod.Name, rel);
      if (/\.(ini|cfg|xml|txt|json|toml|conf|config)$/i.test(rel) && isFile(lf) && !sameFile(dest, lf)) { try { fs.copyFileSync(dest, lf); } catch (e) { /* */ } }
    } else if (there && !cur && winner) {
      // a file no mod put there (the original, or Fusion Fix's): keep it safe to put back later
      const rp = replacedFile(rel);
      if (exists(rp)) trash(dest); else { mkParent(rp); fs.renameSync(dest, rp); }
      there = false;
    }
    if (winner) {
      if (!there || !cur || !eqI(cur, winner.Name)) {
        try { placeFile(libFile(winner.Name, rel), dest); } catch (e) { status("Couldn't place " + rel + ': ' + e.message, 'red'); }
      }
      dep[key] = String(winner.Name);
    } else {
      if (there && cur) fs.rmSync(dest, { force: true });
      const rp = replacedFile(rel);
      if (cur && exists(rp)) { mkParent(dest); fs.renameSync(rp, dest); removeEmptyDirs(path.dirname(rp)); }
      else if (cur) removeEmptyDirs(path.dirname(dest));
      delete dep[key];
    }
  }
  saveDeployed(dep);
  if (list.some(isMergeCopy)) { try { rebuildMerges(mods); } catch (e) { appendLog('merges.log', e.message); } }
  if (list.some(r => /\.ide$/i.test(r))) { try { updateTrainerLists(mods); } catch (e) { /* */ } }
  if (list.some(r => /\.(wtd|img)$/i.test(r))) { try { rebuildTextureMixes(mods); } catch (e) { appendLog('texture-mix.log', e.stack || e.message); } }
}

// ---------------------------------------------------------------- game archives: key, index, modded copies
let arcKey = null, arcIndex = null;
function archiveKey() {
  if (arcKey) return arcKey;
  const hintFile = J(dataDir(), 'keyoffset.txt');
  let hint = -1; if (isFile(hintFile)) { const t = parseInt(readText(hintFile).trim(), 10); if (!isNaN(t)) hint = t; }
  let k = null; try { k = F.findKey(J(E.game, 'GTAIV.exe'), hint); } catch (e) { k = null; }
  if (!k) return null;
  arcKey = k;
  if (F.keyState.lastOffset !== hint && F.keyState.lastOffset >= 0) { try { fs.writeFileSync(hintFile, String(F.keyState.lastOffset)); } catch (e) { /* */ } }
  return k;
}
function gameArchives() {
  return walkFiles(E.game).filter(p => /\.(img|rpf)$/i.test(p)).map(p => relOf(p, E.game))
    .filter(r => !/^(update|LCModInstaller|rtx-remix|backup[^\\/]*)[\\/]/i.test(r));
}
function readArchiveList(rel, key) {
  const p = J(E.game, rel);
  const lines = /\.img$/i.test(rel) ? F.img.list(p, key) : F.rpf.list(p, key);
  const out = [];
  for (const l of lines) {
    if (!l.startsWith('F ')) continue;
    const t = l.substring(2).split(' '); const rsc = t[t.length - 1].startsWith('rsc');
    const sz = rsc ? t[t.length - 2] : t[t.length - 1]; const nameParts = rsc ? t.slice(0, -2) : t.slice(0, -1);
    out.push({ inner: nameParts.join(' '), size: Number(sz), rsc });
  }
  return out;
}
function archiveIndex(quiet) {
  if (arcIndex) return arcIndex;
  const byName = new Map(); arcIndex = byName;
  if (!E.game) return byName;
  let key = null; try { key = archiveKey(); } catch (e) { /* */ }
  const cachePath = J(dataDir(), 'archive-index.json');
  const cache = readJson(cachePath, {}) || {};
  const fresh = {}; let changed = false, n = 0;
  const all = gameArchives();
  for (const rel of all) {
    n++;
    let st; try { st = fs.statSync(J(E.game, rel)); } catch (e) { continue; }
    const sig = st.size + '|' + st.mtimeMs;
    const c = cache[rel]; let files;
    if (c && String(c.Sig) === sig) files = Array.isArray(c.Files) ? c.Files : (c.Files ? [c.Files] : []);
    else {
      if (!quiet) status("Reading what's inside your game archives (" + n + ' of ' + all.length + ', first time only)...', 'dim');
      files = []; try { files = readArchiveList(rel, key).map(x => x.inner); } catch (e) { /* audio archives and odd files are skipped */ }
      changed = true;
    }
    fresh[rel] = { Sig: sig, Files: files };
    for (const inner of files) {
      const lf = lc(String(inner).split('/').pop());
      if (!byName.has(lf)) byName.set(lf, []);
      byName.get(lf).push({ Archive: rel, Inner: String(inner) });
    }
  }
  if (changed || Object.keys(fresh).length !== Object.keys(cache).length) { try { fs.writeFileSync(cachePath, JSON.stringify(fresh)); } catch (e) { /* */ } }
  return byName;
}
// the game archive a file name lives in (main game first, then the episodes)
function findInArchives(name) {
  const ix = archiveIndex(); const hits = ix.get(lc(name)); if (!hits || !hits.length) return null;
  return hits.slice().sort((a, b) =>
    ((/^(tlad|tbogt)[\\/]/i.test(a.Archive) ? 1 : 0) - (/^(tlad|tbogt)[\\/]/i.test(b.Archive) ? 1 : 0)) ||
    ((/\.img$/i.test(a.Archive) ? 0 : 1) - (/\.img$/i.test(b.Archive) ? 0 : 1)) || (a.Archive.length - b.Archive.length))[0];
}
function archiveBase(arc) {
  const want = lc(arc), mods = loadDb();
  for (let mi = mods.length - 1; mi >= 0; mi--) {
    const om = mods[mi]; if (!isOn(om)) continue;
    const whole = (om.Files || []).find(f => f && isWholeArchiveCopy(String(f)) && gamePath(String(f)) === want);
    if (!whole) continue;
    const cand = modPath(om, String(whole)); if (isFile(cand)) return cand;
  }
  return null;
}
function baseMark(arc) { let b = archiveBase(arc); if (!b) b = J(E.game, arc); try { return lc(b) + '|' + fs.statSync(b).size; } catch (e) { return lc(b); } }
const baseMarkPath = (arc) => J(dataDir(), 'archive-bases', arc + '.txt');
const touchesArchive = (m) => modArchives(m).length > 0 || (m.Files || []).some(f => f && isWholeArchiveCopy(String(f)));
// builds one modded copy per archive from the original + every mod that's on (in My Mods order)
function rebuildArchives() {
  const outRoot = J(E.game, ARCHIVE_DIR);
  const byArc = new Map();
  for (const m of loadDb()) {
    if (!isOn(m)) continue;
    for (const it of modArchives(m)) { const k = lc(it.Archive); if (!byArc.has(k)) byArc.set(k, { archive: String(it.Archive), items: [] }); byArc.get(k).items.push(it); }
  }
  if (isDir(outRoot)) for (const old of walkFiles(outRoot)) { const rel = lc(relOf(old, outRoot)); if (!byArc.has(rel)) { rm(old); removeEmptyDirs(path.dirname(old)); } }
  if (!byArc.size) { updateWholeCopies(); return true; }
  const key = archiveKey(); let ok = true;
  for (const [, a] of byArc) {
    const lf = leaf(a.archive);
    let orig = J(E.game, a.archive);
    const base = archiveBase(a.archive); if (base) orig = base;
    const out = J(outRoot, a.archive);
    if (!isFile(orig)) { ok = false; status("Can't find " + a.archive + ' in your game folder.', 'red'); continue; }
    status('Packing ' + lf + '... (a few seconds)', 'dim');
    let inner = a.items.map(x => String(x.Inner)), srcs = a.items.map(x => J(dataDir(), String(x.Store)));
    try { const mx = mixArchiveTextures(a.archive, orig, key, inner, srcs); inner = mx.inner; srcs = mx.srcs; } catch (e) { /* */ }
    try {
      const rep = F.rpf.build(orig, out, key, inner, srcs);
      try { const mk = baseMarkPath(a.archive); mkParent(mk); fs.writeFileSync(mk, baseMark(a.archive)); } catch (e) { /* */ }
      appendLog('archives.log', a.archive + '\r\n' + rep);
    } catch (e) { ok = false; status("Couldn't pack " + lf + ': ' + e.message, 'red'); }
  }
  updateWholeCopies();
  return ok;
}
function updateArchivesIfStale() {
  const built = builtArchives(loadDb()); if (!built.size) return;
  for (const arc of built) {
    const out = J(E.game, ARCHIVE_DIR, arc), mark = baseMarkPath(arc);
    const was = isFile(mark) ? readText(mark).trim() : '';
    if (!isFile(out) || was !== baseMark(arc)) { rebuildArchives(); return; }
  }
}
// whole archive copies from mods: in the game only when the app isn't building a modded copy of that archive
function updateWholeCopies() {
  const mods = loadDb();
  const rels = [...new Set(mods.flatMap(m => m.Files || []).filter(f => f && isWholeArchiveCopy(String(f))).map(String))];
  if (rels.length) syncFiles(rels, mods);
}

// ---------------------------------------------------------------- one-time moves of older installs
function convertToLibrary() {
  if (!E.game) return;
  const mods = loadDb(); const old = mods.filter(m => !inLib(m)); if (!old.length) return;
  status('Updating how your mods are stored (one time only)...', 'dim');
  const dep = loadDeployed(), data = dataDir(), ix = fileIndex(mods);
  mods.forEach((m, i) => {
    if (inLib(m)) return;
    const arcInner = modArchives(m).map(a => String(a.Inner));
    const files = (m.Files || []).filter(f => f && !arcInner.includes(String(f))).map(String);
    if (isOn(m)) {
      for (const rel of files) {
        if ((ix.get(lc(rel)) || []).some(j => j > i && isOn(mods[j]))) continue;
        const p = J(E.game, rel); if (exists(p)) { placeFile(p, libFile(m.Name, rel)); dep[lc(rel)] = String(m.Name); }
      }
    } else {
      const store = J(data, 'disabled', m.Name);
      for (const rel of files) { const s = J(store, rel); if (exists(s)) { const lf = libFile(m.Name, rel); mkParent(lf); fs.renameSync(s, lf); } }
    }
    if (isOn(m)) for (const rel of (m.Backups || []).filter(Boolean).map(String)) {
      const b = J(data, 'backups', m.Name, rel); if (!exists(b)) continue;
      const before = (ix.get(lc(rel)) || []).filter(j => j < i);
      if (before.length) { const ef = libFile(mods[Math.max(...before)].Name, rel); if (!exists(ef)) { mkParent(ef); fs.copyFileSync(b, ef); } }
      else { const rp = replacedFile(rel); if (!exists(rp)) { mkParent(rp); fs.copyFileSync(b, rp); } }
    }
    m.Library = true; m.Backups = [];
  });
  saveDb(mods); saveDeployed(dep);
  for (const m of old) for (const sub of ['disabled', 'backups']) rm(J(data, sub, m.Name));
  for (const sub of ['disabled', 'backups']) { const d = J(data, sub); if (isDir(d) && !walkFiles(d).length) rm(d); }
  syncFiles(allModFiles(mods), mods);
  status('Your mods are stored the new way now - turning them on/off is safe in any order.', 'green');
}
function renameOldImgs() {
  const mods = loadDb(), dep = loadDeployed(), changed = [];
  for (const m of mods) {
    if (!inLib(m)) continue;
    const old = 'update\\' + m.Name + '\\models.img';
    if (!(m.Files || []).some(f => eqI(f, old))) continue;
    const nw = 'update\\' + m.Name + '\\' + imgName(m.Name); if (eqI(nw, old)) continue;
    const lo = libFile(m.Name, old), ln = libFile(m.Name, nw);
    if (isFile(lo) && !isFile(ln)) fs.renameSync(lo, ln);
    m.Files = m.Files.map(f => eqI(f, old) ? nw : f);
    const g = J(E.game, old);
    if (dep[lc(old)]) { delete dep[lc(old)]; if (isFile(g)) rm(g); }
    changed.push(nw);
  }
  if (changed.length) { saveDb(mods); saveDeployed(dep); syncFiles(changed, mods); }
}
function moveDataFiles() {
  const mods = loadDb(), dep = loadDeployed(), changed = [];
  const owned = new Set(); for (const m of mods) for (const f of m.Files || []) if (f) owned.add(lc(f));
  for (const m of mods) {
    if (!inLib(m)) continue;
    let moved = false; const files = (m.Files || []).map(String);
    for (let i = 0; i < files.length; i++) {
      const old = files[i], segs = old.split('\\');
      if (segs.length < 4 || lc(segs[0]) !== 'update' || ROOTS.includes(lc(segs[1])) || /^LC Installer/i.test(segs[1])) continue;
      const gp = gamePath(old); if (!isDataPath(gp)) continue;
      const nw = 'update\\' + segs.slice(2).join('\\');
      const lo = libFile(m.Name, old), ln = libFile(m.Name, nw);
      if (!isFile(lo)) continue;
      if (!isFile(ln)) { mkParent(ln); fs.renameSync(lo, ln); }
      const g = J(E.game, old);
      if (dep[lc(old)]) { delete dep[lc(old)]; if (isFile(g)) { rm(g); removeEmptyDirs(path.dirname(g)); } }
      const gn = J(E.game, nw);
      if (!owned.has(lc(nw)) && isFile(gn) && sameFile(gn, ln)) rm(gn);
      files[i] = nw; owned.add(lc(nw)); moved = true; changed.push(nw);
    }
    if (moved) m.Files = files;
  }
  if (changed.length) { saveDb(mods); saveDeployed(dep); syncFiles(changed, mods); }
  rebuildMerges(mods);
  try { updateTrainerLists(mods); } catch (e) { /* */ }
}
function moveKeyedData() {
  const mods = loadDb(), changed = [];
  for (const m of mods) {
    if (!inLib(m)) continue;
    let moved = false; const files = (m.Files || []).map(String);
    for (let i = 0; i < files.length; i++) {
      const old = files[i];
      if (!/^update\\common\\data\\[^\\]+$/i.test(old)) continue;
      const gp = gamePath(old); if (!KEYED[gp]) continue;
      const nw = 'update\\' + m.Name + '\\' + gp;
      const lo = libFile(m.Name, old), ln = libFile(m.Name, nw);
      if (!isFile(lo)) continue;
      if (!isFile(ln)) { mkParent(ln); fs.renameSync(lo, ln); }
      files[i] = nw; moved = true; changed.push(old, nw);
    }
    if (moved) m.Files = files;
  }
  if (changed.length) { saveDb(mods); syncFiles(changed, mods); rebuildMerges(mods); try { updateTrainerLists(mods); } catch (e) { /* */ } }
}
// a mod's files already in the game folder go into the library (mods found in the game folder)
function importToLibrary(m) {
  const dep = loadDeployed();
  for (const rel of (m.Files || []).filter(Boolean).map(String)) { const p = J(E.game, rel); if (exists(p)) { placeFile(p, libFile(m.Name, rel)); dep[lc(rel)] = String(m.Name); } }
  saveDeployed(dep); m.Library = true;
}
function repairImgArchives() {
  if (!E.game) return 0; let total = 0;
  for (const m of loadDb()) for (const rel of (m.Files || []).filter(f => /\.img$/i.test(String(f)))) {
    for (const p of [J(E.game, rel), J(dataDir(), 'disabled', m.Name, rel), libFile(m.Name, rel)]) if (isFile(p)) { try { total += F.img.repair(p); } catch (e) { /* */ } }
  }
  return total;
}

function setGame(p) {
  E.game = p ? path.resolve(toOs(p)) : '';
  dataDirCache = null; dbCache = null; arcKey = null; arcIndex = null; imgNamesCache.clear();
}
function resetCaches() { arcIndex = null; }

module.exports = {
  E, status, J, toOs, leaf, parentRel, exists, isFile, isDir, mkParent, rm, readText, readLines, readJson, writeJson, lc, eqI, walkFiles, relOf, appendLog,
  ROOTS, dataDir, loadDb, saveDb, isOn, inLib, libFile, replacedFile, loadDeployed, saveDeployed, getOwner, modArchives, modSource, modPath, cleanName, allModFiles,
  placeFile, sameFile, removeEmptyDirs, trash, gamePath, fileIndex, getWinner,
  ARCHIVE_DIR, DATA_DIR, MIX_DIR, MIX_IMG, isWholeArchiveCopy, builtArchives,
  KEYED, MERGE_TARGETS, LINE_FILES, isMergeCopy, isDataPath, updateDest, lineKey, mergeKeyed, rebuildMerges, ideNames, updateTrainerLists,
  isMixWtd, imgName, isModImg, looseMixSets, imgMixSets, rebuildTextureMixes, mixArchiveTextures,
  copyRank, syncFiles, archiveKey, gameArchives, readArchiveList, archiveIndex, findInArchives, archiveBase, touchesArchive, rebuildArchives, updateArchivesIfStale, updateWholeCopies,
  convertToLibrary, renameOldImgs, moveDataFiles, moveKeyedData, importToLibrary, repairImgArchives, setGame, resetCaches,
};
