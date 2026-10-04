'use strict';
// Unpacking a mod, working out where every file goes, checks before installing, and install / uninstall / on / off.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');
const F = require('./formats.cjs');
const C = require('./core.cjs');
const { E, J, lc, eqI, isFile, isDir, exists, leaf, walkFiles, readLines, readText, mkParent, rm } = C;
const status = (t, c) => C.status(t, c);

const DOC_EXT = ['.url', '.htm', '.html', '.pdf', '.rtf', '.lnk'];
const DATA_EXT = ['.wtd', '.wdr', '.wft', '.wdd', '.wbd', '.wbn', '.wpl', '.ide', '.ipl', '.wad', '.wvd', '.wfd', '.nod', '.sco', '.rpf', '.whm', '.gxt', '.dat', '.xml', '.csv', '.wav', '.bik'];
const IMG_EXT = ['.wft', '.wtd', '.wdr', '.wdd', '.wbd', '.wbn'];
const MODEL_EXT = ['.wtd', '.wdr', '.wft', '.wdd', '.wbd', '.wbn', '.wpl', '.ide', '.ipl', '.wad', '.wvd', '.wfd', '.nod', '.sco', '.rpf', '.img'];
const KNOWN_PATHS = {
  'playerped.rpf': 'pc\\models\\cdimages\\playerped.rpf', 'componentpeds.img': 'pc\\models\\cdimages\\componentpeds.img',
  'streamedpeds.img': 'pc\\models\\cdimages\\streamedpeds.img', 'pedprops.img': 'pc\\models\\cdimages\\pedprops.img',
  'vehicles.img': 'pc\\models\\cdimages\\vehicles.img', 'weapons.img': 'pc\\models\\cdimages\\weapons.img',
  'handling.dat': 'common\\data\\handling.dat', 'carcols.dat': 'common\\data\\carcols.dat', 'vehicles.ide': 'common\\data\\vehicles.ide',
  'peds.ide': 'common\\data\\peds.ide', 'weaponinfo.xml': 'common\\data\\weaponinfo.xml', 'visualsettings.dat': 'common\\data\\visualsettings.dat',
  'timecyc.dat': 'pc\\data\\timecyc.dat',
};
const WRAPPERS = ['d3d9.dll', 'dxgi.dll', 'd3d11.dll', 'opengl32.dll', 'dinput8.dll'];
const LAUNCHERS = ['gtaiv.exe', 'playgtaiv.exe', 'eflc.exe', 'launcheflc.exe', 'launchgtaiv.exe'];
const ext = (n) => lc(path.extname(n));
const stemOf = (n) => path.basename(n, path.extname(n));
const fileInfo = (full) => { const st = fs.statSync(full); return { full, name: path.basename(full), ext: ext(full), dir: path.dirname(full), size: st.size, mtime: st.mtimeMs }; };

// ---------------------------------------------------------------- game version (from GTAIV.exe's version info)
function gameVersion() {
  try {
    const b = fs.readFileSync(J(E.game, 'GTAIV.exe'));
    const sig = Buffer.from([0xBD, 0x04, 0xEF, 0xFE]);   // VS_FIXEDFILEINFO
    const at = b.indexOf(sig); if (at < 0) return null;
    const ms = b.readUInt32LE(at + 8), ls = b.readUInt32LE(at + 12);
    return [ms >>> 16, ms & 0xFFFF, ls >>> 16, ls & 0xFFFF];
  } catch (e) { return null; }
}
const verText = (v) => v ? v.join('.') : '';
const isCompleteEdition = () => { const v = gameVersion(); return !!(v && (v[0] > 1 || (v[0] === 1 && v[1] >= 2))); };

// ---------------------------------------------------------------- unpacking
function find7z() { for (const b of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432]) if (b) { const p = path.join(b, '7-Zip', '7z.exe'); if (isFile(p)) return p; } return null; }
function findUnRar() { for (const b of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432]) if (b) { const p = path.join(b, 'WinRAR', 'UnRAR.exe'); if (isFile(p)) return p; } return null; }
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const d of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, d.name), t = path.join(dst, d.name);
    if (d.isDirectory()) copyDir(s, t); else if (d.isFile()) fs.copyFileSync(s, t);
  }
}
function expandMod(p) {
  const tmp = J(C.dataDir(), 'temp', Math.random().toString(16).slice(2, 10));
  fs.mkdirSync(tmp, { recursive: true });
  const e = ext(p);
  if (isDir(p)) copyDir(p, tmp);
  else if (e === '.zip' || e === '.oiv') {
    try { F.zip.extract(p, tmp); }
    catch (er) { const z = find7z(); if (!z) throw er; cp.execFileSync(z, ['x', '-y', '-o' + tmp, p], { windowsHide: true, stdio: 'ignore' }); }
  } else {
    const z = find7z();
    if (z) cp.execFileSync(z, ['x', '-y', '-o' + tmp, p], { windowsHide: true, stdio: 'ignore' });
    else if (e === '.rar' && findUnRar()) cp.execFileSync(findUnRar(), ['x', '-y', p, tmp + path.sep], { windowsHide: true, stdio: 'ignore' });
    else { const er = new Error("Can't open " + e + ' files. Install 7-Zip (free) or extract the mod first and choose the folder.'); er.friendly = true; er.need7z = true; throw er; }
  }
  // unpack any OpenIV packages found inside
  for (const o of walkFiles(tmp).filter(f => /\.oiv$/i.test(f))) {
    const d = path.join(path.dirname(o), stemOf(o) + '__oiv');
    try { F.zip.extract(o, d); fs.rmSync(o, { force: true }); } catch (er) { /* left as is */ }
  }
  return tmp;
}

// ---------------------------------------------------------------- docs and pictures
const isPicture = (f) => /\.(jpg|jpeg|png|bmp|gif|webp)$/i.test(f.name);
function docRow(f) {
  if (isPicture(f)) return row(f.full, '', 'PREVIEW', "Just a preview picture - the game doesn't use it. Click to see it.");
  return row(f.full, '', 'SKIP', 'Readme or notes - not needed by the game');
}
function isDoc(f, gfxDirs) {
  const n = lc(f.name);
  if (DOC_EXT.includes(f.ext)) return true;
  if (/^(readme|read me|leeme|lisezmoi|install|instructions|changelog|license|credits)/.test(n)) return true;
  if (/^(screen|preview|thumb)/.test(n) && /\.(jpg|jpeg|png|bmp|gif)$/.test(n)) return true;
  if (/\.(jpg|jpeg|png|bmp|gif|webp)$/.test(n)) {
    if (gfxDirs && gfxDirs.size) {
      for (const gd of gfxDirs) if (lc(f.full).startsWith(lc(gd) + path.sep)) return false;
      if (/[\\/](reshade[^\\/]*|enbseries|enb[^\\/]*)[\\/]/i.test(f.full)) return false;
    }
    return true;
  }
  if (/\.(txt|nfo|md|doc|docx)$/.test(n) && n !== 'commandline.txt') return true;
  if (n === 'thumbs.db' || /^\.git/.test(n) || n === '.editorconfig') return true;
  return false;
}
const row = (src, dest, kind, note) => ({ Source: src, Dest: dest, Kind: kind, Note: note || '' });

// ---------------------------------------------------------------- where does this file go? (clues, strongest first)
let learned = null, binIndex = null, gameFileIdx = null, rpfIndex = null, planHints = [];
function resetIndexes() { learned = null; binIndex = null; gameFileIdx = null; rpfIndex = null; }
const learnedPath = () => J(C.dataDir(), 'learned.json');
function loadLearned() { if (learned) return learned; learned = {}; const o = C.readJson(learnedPath(), {}); for (const k of Object.keys(o || {})) learned[k] = String(o[k]); return learned; }
function namePattern(name) {
  const e = path.extname(name), stem = stemOf(name);
  const cut = stem.search(/[_\-. ]/);
  if (cut < 2 || !e) return null;
  return lc(stem.substring(0, cut + 1) + '*' + e);
}
function saveLearned(name, folder) {
  const h = loadLearned(); h[lc(name)] = folder;
  const pat = namePattern(name); if (pat) h[pat] = folder;
  try { C.writeJson(learnedPath(), h); } catch (e) { /* */ }
}
// paths written in the mod's readme ("copy to scripts\SpiderMan\Suits")
function readmeHints(files) {
  const hints = [];
  for (const f of files) {
    if (f.size > 1024 * 1024) continue;
    if (!/^\.(txt|md|nfo|rtf)$/.test(f.ext) && !/^(read ?me|install|instructions)/i.test(f.name)) continue;
    let lines = []; try { lines = readLines(f.full); } catch (e) { continue; }
    for (const line of lines) {
      const re = /(?<![\w])((?:scripts|plugins|update|common|pc|tlad|tbogt)(?:[\\/][^\\/:*?"<>|\r\n]+)+|(?:scripts|plugins)(?=[\\/\s.,)]|$))/gi;
      let m;
      while ((m = re.exec(line))) {
        const segs = m[1].split(/[\\/]/).map(s => s.trim()).filter(Boolean);
        const keep = [];
        for (const sg of segs) {
          const parts = sg.split(/\s+(?:and|then|folder|directory|to|in|from|or|if|with)\b/i);
          const clean = parts[0].trim().replace(/[.,;:)"']+$/, '');
          if (clean) keep.push(clean);
          if (parts.length > 1 || !clean) break;
        }
        if (keep.length) hints.push({ Path: keep.join('\\'), Line: String(line) });
      }
    }
  }
  return hints;
}
// your installed scripts and plugins (they often name their files and folders)
function getBinaryIndex() {
  if (binIndex) return binIndex;
  const list = [], cand = [];
  for (const top of ['scripts', 'plugins']) { const d = J(E.game, top); if (isDir(d)) cand.push(...walkFiles(d).filter(f => /\.(dll|asi|cs|vb)$/i.test(f))); }
  try { for (const n of fs.readdirSync(E.game)) if (/\.asi$/i.test(n)) cand.push(J(E.game, n)); } catch (e) { /* */ }
  let total = 0;
  for (const f of cand.slice(0, 250)) {
    let st; try { st = fs.statSync(f); } catch (e) { continue; }
    if (st.size > 16 * 1024 * 1024 || /fusionfix/i.test(path.basename(f))) continue;
    total += st.size; if (total > 200 * 1024 * 1024) break;
    try { const b = fs.readFileSync(f); list.push({ rel: C.relOf(f, E.game), a: b.toString('latin1'), u: b.toString('utf16le') }); } catch (e) { /* */ }
  }
  return (binIndex = list);
}
function pathBefore(text, idx) {
  const start = Math.max(0, idx - 160), chunk = text.substring(start, idx);
  let cut = -1; for (let i = chunk.length - 1; i >= 0; i--) if ('\0"\n\r|*<>'.includes(chunk[i])) { cut = i; break; }
  let p = chunk.substring(cut + 1).replace(/\//g, '\\').replace(/\\\\/g, '\\').replace(/^[.\\]+/, '');
  if (/[^\x20-\x7e]/.test(p)) return '';
  return p.replace(/\\+$/, '');
}
function findInBinaries(name) {
  const idx = getBinaryIndex(); if (!idx.length) return null;
  const terms = [name]; const pat = namePattern(name); if (pat) terms.push(pat.substring(0, pat.indexOf('*')));
  for (const t of terms) {
    if (t.length < 4) continue;
    for (const bin of idx) for (const txt of [bin.a, bin.u]) {
      const at = lc(txt).indexOf(lc(t)); if (at < 0) continue;
      const before = pathBefore(txt, at), binDir = C.parentRel(bin.rel);
      let folder = null;
      if (before) {
        if (/^(scripts|plugins|update)(\\|$)/i.test(before)) folder = before;
        else if (binDir && exists(J(E.game, binDir, before))) folder = binDir + '\\' + before;
        else if (exists(J(E.game, before))) folder = before;
      }
      if (folder) return { Folder: folder, Score: 80, Why: leaf(bin.rel) + ' looks for it in ' + folder };
      if (t === name && binDir) return { Folder: binDir, Score: 45, Why: leaf(bin.rel) + ' uses this file - put next to it' };
    }
  }
  return null;
}
function iniKeys(p) {
  const k = new Set(); let lines = []; try { lines = readLines(p).slice(0, 400); } catch (e) { return k; }
  for (const l of lines) { const t = l.trim(); let m; if ((m = /^\[(.+)\]$/.exec(t))) k.add('[' + lc(m[1]) + ']'); else if ((m = /^([^=;#]+)=/.exec(t))) k.add(lc(m[1].trim())); }
  return k;
}
function findLookAlikeIni(p) {
  const mine = iniKeys(p); if (mine.size < 2) return null;
  let best = null, bestScore = 0;
  for (const r of gameFileIndex()) {
    if (!/\.ini$/i.test(r)) continue;
    const other = iniKeys(J(E.game, r)); if (other.size < 2) continue;
    const same = [...mine].filter(x => other.has(x)).length, all = new Set([...mine, ...other]).size;
    const j = same / Math.max(1, all); if (j > bestScore) { bestScore = j; best = r; }
  }
  if (best && bestScore >= 0.5) { const fd = C.parentRel(best); return { Folder: fd, Score: 50, Why: 'Its settings match ' + leaf(best) + ' in ' + (fd || 'the game folder') }; }
  return null;
}
const stemName = (n) => n.replace(/\.(net\.dll|asi|dll|cs|vb|ini|cfg|xml|txt|json|log|toml|dat)$/i, '');
function findPlace(f) {
  if (!E.game) return null;
  const name = f.name, found = [];
  const L = loadLearned(), pat = namePattern(name);
  if (L[lc(name)] !== undefined) found.push({ Folder: L[lc(name)], Score: 98, Why: 'You put this file here last time' });
  else if (pat && L[pat] !== undefined) found.push({ Folder: L[pat], Score: 95, Why: 'You put ' + pat + ' files here last time' });
  const stem = stemName(name);
  if (/\.(ini|cfg|xml|json|txt)$/i.test(name)) {
    for (const r of gameFileIndex()) { const lf = leaf(r); if (/\.(asi|dll|cs|vb)$/i.test(lf) && eqI(stemName(lf), stem)) { found.push({ Folder: C.parentRel(r), Score: 85, Why: 'Settings for ' + lf + ' - goes next to it' }); break; } }
  }
  const like = findSimilarPlace(name);
  if (like && like.Why.startsWith('Replaces')) found.push({ Folder: like.Folder, Score: 100, Why: like.Why });
  for (const h of planHints) {
    if (new RegExp('(^|\\\\)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i').test(h.Path)) { found.push({ Folder: C.parentRel(h.Path), Score: 90, Why: 'The readme says: ' + h.Path }); break; }
    const pre = pat ? pat.substring(0, pat.indexOf('*')) : '~~none~~';
    if ((lc(h.Line).includes(lc(name)) || lc(h.Line).includes(lc(pre))) && !/\.[a-z0-9]{2,4}$/i.test(h.Path)) { found.push({ Folder: h.Path, Score: 70, Why: 'The readme says to put it in ' + h.Path }); break; }
  }
  if (like && !like.Why.startsWith('Replaces')) found.push({ Folder: like.Folder, Score: 60, Why: like.Why });
  if (!found.some(x => x.Score >= 80)) {
    const bin = findInBinaries(name); if (bin) found.push(bin);
    if (f.ext === '.ini') { const ini = findLookAlikeIni(f.full); if (ini) found.push(ini); }
  }
  if (!found.length) return null;
  return found.sort((a, b) => b.Score - a.Score)[0];
}
// files in the game folder that mods put there (scripts, plugins, mod folders) - not the game's own data
function gameFileIndex() {
  if (gameFileIdx) return gameFileIdx;
  const skip = ['update', 'lcmodinstaller', 'pc', 'common', 'tlad', 'tbogt', 'audio', 'movies', 'tbogt_dlc', 'tlad_dlc'];
  const list = [];
  let ents = []; try { ents = fs.readdirSync(E.game, { withFileTypes: true }); } catch (e) { /* */ }
  for (const d of ents) if (d.isFile()) list.push(d.name);
  for (const d of ents) if (d.isDirectory() && !skip.includes(lc(d.name))) for (const f of walkFiles(J(E.game, d.name))) list.push(C.relOf(f, E.game));
  return (gameFileIdx = list);
}
function findSimilarPlace(name) {
  if (!E.game) return null;
  const idx = gameFileIndex();
  const same = idx.filter(r => eqI(leaf(r), name));
  if (same.length) { const folder = C.parentRel(same[0]); return { Folder: folder, Why: 'Replaces the one you have in ' + (folder || 'the game folder') + ' (backed up)' }; }
  const e = path.extname(name), stem = stemOf(name), cut = stem.search(/[_\-. ]/);
  if (cut < 2 || !e) return null;
  const prefix = stem.substring(0, cut + 1), counts = new Map();
  for (const r of idx) { const lf = leaf(r); if (lc(lf).startsWith(lc(prefix)) && lc(lf).endsWith(lc(e))) { const fd = C.parentRel(r); counts.set(fd, (counts.get(fd) || 0) + 1); } }
  if (!counts.size) return null;
  const best = [...counts].sort((a, b) => b[1] - a[1])[0];
  return { Folder: best[0], Why: 'Goes next to your other ' + prefix + '*' + e + ' files in ' + (best[0] || 'the game folder') };
}
// where an archive (like playerped.rpf) lives in the game folder
function findArchivePath(prefix, name) {
  const segs = String(prefix || '').split('\\').filter(Boolean);
  for (let i = 0; i < segs.length; i++) {
    if (['pc', 'common', 'tlad', 'tbogt'].includes(lc(segs[i]))) {
      const cand = [...segs.slice(i), name].join('\\');
      if (exists(J(E.game, cand))) return cand;
      break;
    }
  }
  if (!rpfIndex) rpfIndex = walkFiles(E.game).filter(p => /\.rpf$/i.test(p)).map(p => C.relOf(p, E.game)).filter(r => !/(^|\\)(update|LCModInstaller)\\/i.test(r));
  const hits = rpfIndex.filter(r => eqI(leaf(r), name)).sort((a, b) => ((/^(tlad|tbogt)\\/i.test(a) ? 1 : 0) - (/^(tlad|tbogt)\\/i.test(b) ? 1 : 0)) || (a.length - b.length));
  return hits[0] || null;
}
function archiveRow(src, hit, mod) {
  const lf = leaf(hit.Archive);
  if (/\.img$/i.test(hit.Archive)) return row(src, 'update\\' + mod + '\\' + C.imgName(mod), 'IMG', 'Replaces ' + path.basename(src) + ' from ' + lf + ' - packed into an archive Fusion Fix loads');
  return row(src, hit.Archive + '|' + hit.Inner, 'ARCHIVE', 'Replaces ' + hit.Inner + ' inside ' + lf + ' - packed automatically');
}
function mapRow(src, gp, mod, note) {
  const segs = gp.split('\\'), first = lc(segs[0]);
  if (first === 'update') {
    const rest = segs.slice(1);
    const dest = (rest.length > 1 && C.ROOTS.includes(lc(rest[0]))) ? C.updateDest(mod, rest.join('\\')) : 'update\\' + rest.join('\\');
    return row(src, dest, 'OVERLOADER', note);
  }
  if (C.ROOTS.includes(first)) return row(src, C.updateDest(mod, gp), 'OVERLOADER', note);
  if (first === 'scripts') return row(src, gp, 'SCRIPT', note);
  return row(src, gp, 'GAME FOLDER', note);
}

// ---------------------------------------------------------------- data lines in a notes file
function isDataLine(target, t) {
  const lf = leaf(target);
  if (lf === 'handling.dat') { const tk = t.split(/\s+/); return tk.length >= 10 && /^[%!$^]?[A-Za-z0-9_]{2,16}$/.test(tk[0]) && tk.filter(x => /^-?\d+(\.\d+)?[A-Za-z]?$/.test(x)).length >= 8; }
  if (lf === 'vehicles.ide' || lf === 'peds.ide') return /^(cars|peds|end|txdp)$/i.test(t) || (t.split(',').length >= 6 && /^[A-Za-z0-9_]+\s*,/.test(t));
  if (lf === 'carcols.dat') return /^(col|car3|car4|end)$/i.test(t) || /^[A-Za-z0-9_]+\s*,\s*\d+\s*,/.test(t);
  if (lf === 'cargrp.dat' || lf === 'pedgrp.dat') return /^[A-Za-z0-9_]+\s*,.*#\s*\S+/.test(t);
  return /^(IDE|IPL|IMG|CDIMAGE|COLFILE|HIERARCHY|TEXDICTION|MODELFILE|SPLASH|RADAR|MAPZONE)\b/i.test(t) || /(common|pc|platform):\//i.test(t);
}
function splitLinesFile(p) {
  const out = []; let cur = null; const buf = new Map();
  for (const raw of readLines(p)) {
    const t = raw.trim(); if (!t) continue;
    const m = /^(?:#+|;+|\/\/|-+|\[|=+|\*+)?\s*([A-Za-z0-9_]+\.(?:dat|ide|txt))\s*(?:\]|:|-+|=+|\*+)?\s*$/.exec(t);
    if (m && C.LINE_FILES[lc(m[1])]) { cur = C.LINE_FILES[lc(m[1])]; if (!buf.has(cur)) buf.set(cur, []); continue; }
    if (!cur) continue;
    if (isDataLine(cur, t)) buf.get(cur).push(t);
  }
  for (const [k, ls0] of buf) {
    let ls = ls0.slice();
    const data = ls.filter(x => !/^(cars|peds|end|txdp|col|car3|car4)$/i.test(x));
    if (!data.length) continue;
    const lf = leaf(k);
    if ((lf === 'vehicles.ide' || lf === 'peds.ide') && !/^(cars|peds|txdp)$/i.test(ls[0])) ls = [lf === 'peds.ide' ? 'peds' : 'cars', ...ls, 'end'];
    if (lf === 'carcols.dat' && /^(col|car3|car4)$/i.test(ls[0]) && !eqI(ls[ls.length - 1], 'end')) ls.push('end');
    out.push({ Target: k, Lines: ls, Count: data.length });
  }
  return out;
}

// ---------------------------------------------------------------- the plan
function parseAssembly(xml) {
  // tiny reader for OpenIV assembly.xml: <content> <add source="x">dest</add> <archive path=".."> <add source="..">inner</add> </archive> <text>/<delete>
  const content = (/<content[^>]*>([\s\S]*?)<\/content>/i.exec(xml) || [])[1] || '';
  const adds = [], archives = [];
  const archRe = /<archive\b([^>]*)>([\s\S]*?)<\/archive>/gi; let m;
  const rest = content.replace(archRe, (all, attrs, body) => {
    const p = (/\bpath\s*=\s*"([^"]*)"/i.exec(attrs) || [])[1] || '';
    const items = []; const ar = /<add\b([^>]*)>([\s\S]*?)<\/add>/gi; let a;
    while ((a = ar.exec(body))) items.push({ source: (/\bsource\s*=\s*"([^"]*)"/i.exec(a[1]) || [])[1] || '', text: a[2] });
    archives.push({ path: p, items }); return '';
  });
  const ar = /<add\b([^>]*)>([\s\S]*?)<\/add>/gi;
  while ((m = ar.exec(rest))) adds.push({ source: (/\bsource\s*=\s*"([^"]*)"/i.exec(m[1]) || [])[1] || '', text: m[2] });
  const dec = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  for (const x of adds) { x.source = dec(x.source); x.text = dec(x.text); }
  for (const a of archives) { a.path = dec(a.path); for (const x of a.items) { x.source = dec(x.source); x.text = dec(x.text); } }
  return { adds, archives, edits: /<(text|delete)\b/i.test(content) };
}
function buildPlan(root, modName) {
  const rows = [];
  const files = walkFiles(root).map(fileInfo);
  const mod = C.cleanName(modName);
  let warning = '';
  // Fusion Fix itself: installed exactly as it ships, your settings are kept
  const ffAsi = files.find(f => eqI(f.name, 'GTAIV.EFLC.FusionFix.asi') && !/[\\/]_installer_options[\\/]/i.test(f.full));
  if (ffAsi) {
    const base = eqI(path.basename(ffAsi.dir), 'plugins') ? path.dirname(ffAsi.dir) : ffAsi.dir;
    for (const f of files) {
      if (!f.full.startsWith(base + path.sep)) { rows.push(row(f.full, '', 'SKIP', 'Not part of Fusion Fix')); continue; }
      const rel = C.relOf(f.full, base);
      if (isDoc(f)) { rows.push(docRow(f)); continue; }
      if (eqI(rel, 'plugins\\GTAIV.EFLC.FusionFix.ini') && exists(J(E.game, rel))) { rows.push(row(f.full, '', 'SKIP', 'Keeping your current Fusion Fix settings')); continue; }
      rows.push(row(f.full, rel, 'CORE', 'Fusion Fix'));
    }
    return { rows, warning: 'This is Fusion Fix. It installs exactly as it ships and keeps your current settings.' };
  }
  if (files.some(f => eqI(f.name, 'IVTweaker.asi')) && isCompleteEdition()) {
    for (const f of files) rows.push(row(f.full, '', 'MANUAL', "IV Tweaker doesn't support the Complete Edition"));
    return { rows, warning: 'IV Tweaker only works on GTA IV 1.0.7.0 / 1.0.8.0. Your game is the Complete Edition (' + verText(gameVersion()) + '), so it would break or not load. Fusion Fix already does its job here - loose models are packed for it automatically.' };
  }
  if (files.some(f => /^(Add_Tools_(IV|EFLC)|AT_Uninstall)\.exe$/i.test(f.name)) && isCompleteEdition()) {
    for (const f of files) rows.push(row(f.full, '', 'MANUAL', 'AddTools is for old GTA IV versions - it would break the Complete Edition'));
    return { rows, warning: "AddTools is made for the old GTA IV (1.0.x). It replaces gta.dat, default.dat, images.txt and handling.dat with old copies and adds an old ScriptHook and loader - on your Complete Edition with Fusion Fix that breaks the game. Nothing was installed. Don't run its setup either." };
  }
  if ((/icenhancer/i.test(modName) || files.some(f => /icenhancer/i.test(f.full))) && isCompleteEdition()) {
    for (const f of files) rows.push(row(f.full, '', 'MANUAL', 'iCEnhancer only works on the old GTA IV 1.0.4.0, not the Complete Edition'));
    return { rows, warning: "iCEnhancer is made only for the old GTA IV 1.0.3.0 - 1.0.4.0 (with ENB). Its main file can't run on your Complete Edition and it would break Fusion Fix's menu text, so nothing was installed." };
  }
  const imgNames = new Set();
  const scriptDirs = new Set(), asiDirs = new Set();
  for (const f of files) {
    const n = lc(f.name);
    if (n.endsWith('.net.dll') || f.ext === '.cs' || f.ext === '.vb') scriptDirs.add(f.dir);
    if (f.ext === '.asi') asiDirs.add(f.dir);
  }
  // graphics presets (ENB, ReShade, RTX Remix): the whole folder goes to the game folder as it is
  const gfxDirs = new Set();
  for (const f of files) {
    if (!WRAPPERS.includes(lc(f.name))) continue;
    const d = f.dir; let names = []; try { names = fs.readdirSync(d).map(lc); } catch (e) { /* */ }
    const has = (n) => names.includes(n);
    if (has('enbseries.ini') || has('enblocal.ini') || has('enbseries') || has('reshade-shaders') || names.some(n => /^reshade.*\.ini$/.test(n)) || names.some(n => n.endsWith('.fx')) ||
      has('rtx_comp') || has('.trex') || has('rtx-remix') || has('rtx.conf') || has('dxvk.conf')) gfxDirs.add(d);
  }
  // OpenIV packages: follow assembly.xml
  const oivHandled = new Set();
  for (const asm of files.filter(f => eqI(f.name, 'assembly.xml'))) {
    try {
      const x = parseAssembly(readText(asm.full));
      const base = path.join(asm.dir, 'content');
      for (const add of x.adds) {
        const src = path.join(base, C.toOs(add.source)); const dst = add.text.replace(/\//g, '\\').trim();
        if (exists(src)) { oivHandled.add(src); rows.push(mapRow(src, dst, mod, 'OpenIV package')); }
      }
      for (const arc of x.archives) for (const add of arc.items) {
        const src = path.join(base, C.toOs(add.source)); if (!exists(src)) continue;
        oivHandled.add(src);
        const arcPath = arc.path.replace(/\//g, '\\').trim(), innerPath = add.text.replace(/\\/g, '/').trim().replace(/^\/+/, '');
        if (/\.img$/i.test(arcPath)) rows.push(row(src, 'update\\' + mod + '\\' + C.imgName(mod), 'IMG', 'Packed into an archive Fusion Fix loads (was for ' + leaf(arcPath) + ')'));
        else if (/\.rpf$/i.test(arcPath) && arcPath.split(/\.rpf\\/i).length === 1) {
          const arcRel = findArchivePath(C.parentRel(arcPath), leaf(arcPath));
          if (arcRel) rows.push(row(src, arcRel + '|' + innerPath, 'ARCHIVE', 'Packed into ' + leaf(arcRel) + ' automatically'));
          else rows.push(row(src, '', 'MANUAL', 'Goes inside ' + arcPath + ", which isn't in your game folder"));
        } else rows.push(row(src, '', 'MANUAL', 'Goes inside an archive within an archive (' + arcPath + ') - not supported yet'));
      }
      if (x.edits) rows.push(row(asm.full, '', 'MANUAL', 'Package also edits text files - check its readme'));
      oivHandled.add(asm.full);
    } catch (e) { /* */ }
  }
  planHints = readmeHints(files);
  // text inside the mod's own programs: a .txt they read by name is a data file, not a readme
  let codeText = '';
  for (const cf of files.filter(f => /^\.(dll|asi|cs|vb)$/.test(f.ext) && f.size < 16 * 1024 * 1024)) {
    try { const b = fs.readFileSync(cf.full); codeText += b.toString('latin1') + b.toString('utf16le'); } catch (e) { /* */ }
  }
  const codeLc = lc(codeText);
  const remixPack = files.some(f => /^\.usd[ac]?$/.test(f.ext));
  let tmpDir = null;
  for (const f of files) {
    if (oivHandled.has(f.full)) continue;
    if (/__oiv[\\/]/i.test(f.full)) continue;
    // a notes file listing lines for handling.dat, vehicles.ide, carcols.dat... - the app adds them
    if (/^\.(txt|dat|ini)$/.test(f.ext) && f.size < 1024 * 1024 && !C.LINE_FILES[lc(f.name)]) {
      let parts = []; try { parts = splitLinesFile(f.full); } catch (e) { /* */ }
      if (parts.length) {
        tmpDir = tmpDir || J(C.dataDir(), 'temp', 'lines', Math.random().toString(16).slice(2, 12));
        for (const pt of parts) {
          const lf = leaf(pt.Target), tf = path.join(tmpDir, lf);
          mkParent(tf); fs.writeFileSync(tf, pt.Lines.join('\r\n') + '\r\n');
          rows.push(row(tf, C.updateDest(mod, pt.Target), 'DATA LINES', 'From ' + f.name + ': ' + pt.Count + ' line' + (pt.Count !== 1 ? 's' : '') + " added to your game's " + lf));
        }
        if (/^read ?me/i.test(f.name)) rows.push(docRow(f));
        continue;
      }
    }
    if (isDoc(f, gfxDirs) && !(codeText && !/^read ?me/i.test(f.name) && codeLc.includes(lc(stemOf(f.name))))) { rows.push(docRow(f)); continue; }
    const rel = C.relOf(f.full, root), segs = rel.split('\\');
    const skipDir = segs.slice(0, -1).filter(s => /do ?n.?t ?copy|dont ?copy|not ?copy|^_?optional\b|^backups?$|^original ?files$|^originals?$|^alternat/i.test(s));
    if (skipDir.length) { rows.push(row(f.full, '', 'SKIP', "Left out - the mod's '" + skipDir[0] + "' folder (click it to add it anyway)")); continue; }
    let anchor = -1;
    for (let i = 0; i < segs.length - 1; i++) { const s = lc(segs[i]); if (['update', 'scripts', 'plugins', 'rtx-remix', 'rtx_comp'].includes(s) || C.ROOTS.includes(s)) { anchor = i; break; } }
    const n = lc(f.name), e = f.ext;
    if (n === 'dinput8.dll' && exists(J(E.game, 'plugins\\GTAIV.EFLC.FusionFix.asi'))) { rows.push(row(f.full, '', 'MANUAL', "Would replace Fusion Fix's mod loader - left out so your .asi mods keep working")); continue; }
    let mm;
    if (remixPack && !/(^|[\\/])rtx-remix[\\/]/i.test(rel) && (mm = /(^|[\\/])(mods[\\/].+)$/i.exec(rel))) { rows.push(row(f.full, 'rtx-remix\\' + mm[2].replace(/\//g, '\\'), 'GAME FOLDER', 'RTX Remix assets')); continue; }
    if (/(^|[\\/])_installer_options[\\/]/i.test(rel)) {
      if ((mm = /_installer_options[\\/]FusionFix_RTXRemixFork[\\/](.+)$/i.exec(rel))) {
        const dst = mm[1];
        if (/^(plugins|update|common|pc)\\/i.test(dst) || !dst.includes('\\')) { rows.push(row(f.full, dst, 'GAME FOLDER', 'RTX Remix version of Fusion Fix - this mod needs it (your old one is backed up)')); continue; }
      }
      rows.push(row(f.full, '', 'SKIP', "Extra for the mod's own installer - not needed")); continue;
    }
    if (n === 'xlive.dll' || n === 'xlive_d.dll') { rows.push(row(f.full, '', 'MANUAL', "Only for old game versions (Games for Windows Live) - the Complete Edition doesn't need it")); continue; }
    if (LAUNCHERS.includes(n)) { rows.push(row(f.full, '', 'MANUAL', "Replaces the game's launcher - never installed automatically")); continue; }
    if ((mm = /^(.*?)([^\\]+\.rpf)\\(.+)$/i.exec(rel))) {
      const arcPre = mm[1], arcName = mm[2], innerPath = mm[3].replace(/\\/g, '/');
      const arcRel = findArchivePath(arcPre, arcName);
      if (arcRel) rows.push(row(f.full, arcRel + '|' + innerPath, 'ARCHIVE', 'Packed into ' + arcName + ' automatically'));
      else rows.push(row(f.full, '', 'MANUAL', 'Goes inside ' + arcName + ", which isn't in your game folder"));
      continue;
    }
    if (/^(head|uppr|lowr|feet|hand|hair|teef|suse|sus2|accs|task|decl|jaw)_(diff_|normal_|spec_)?\d{3}_/.test(n)) {
      const arcRel = findArchivePath('pc\\models\\cdimages\\', 'playerped.rpf');
      if (arcRel) rows.push(row(f.full, arcRel + '|?' + f.name, 'ARCHIVE', "Niko's clothes/face - packed into playerped.rpf automatically"));
      else rows.push(row(f.full, '', 'MANUAL', "A piece of Niko (clothes/face) - playerped.rpf wasn't found in your game folder"));
      continue;
    }
    if (anchor >= 0) {
      const gp = segs.slice(anchor).join('\\');
      const packIt = IMG_EXT.includes(e) && (/\\[^\\]+\.img\\/i.test(gp) || /^(update\\)?(tlad\\|tbogt\\)?pc\\models\\cdimages\\[^\\]+$/i.test(gp));
      if (!packIt) { rows.push(mapRow(f.full, gp, mod, '')); continue; }
    }
    if (anchor < 0 && KNOWN_PATHS[n]) {
      const kn = C.KEYED[KNOWN_PATHS[n]] ? "Combined with your game's " + n + ' - only its own cars/peds are changed or added' : "Replaces the game's " + n;
      rows.push(row(f.full, C.updateDest(mod, KNOWN_PATHS[n]), 'OVERLOADER', kn)); continue;
    }
    let gfxBase = ''; for (const d of gfxDirs) if (f.dir === d || f.dir.startsWith(d + path.sep)) gfxBase = d;
    if (gfxBase) {
      const sub = C.relOf(f.full, gfxBase);
      if (/^_installer_options\\/i.test(sub)) { rows.push(row(f.full, '', 'SKIP', "Extra for the mod's own installer - not copied")); continue; }
      rows.push(row(f.full, sub, 'GRAPHICS', 'Graphics preset')); continue;
    }
    if (IMG_EXT.includes(e)) {
      if (imgNames.has(n)) { rows.push(row(f.full, '', 'SKIP', 'Another copy of this model in the mod - the first one is used')); continue; }
      imgNames.add(n);
      let hit = null; try { hit = C.findInArchives(f.name); } catch (er) { /* */ }
      if (hit) { rows.push(archiveRow(f.full, hit, mod)); continue; }
      const ix = C.archiveIndex();
      rows.push(row(f.full, 'update\\' + mod + '\\' + C.imgName(mod), 'IMG', ix.size ? 'New model (not in your game) - packed; an add-on may also need lines added, see its readme' : 'Packed into an archive Fusion Fix loads'));
      continue;
    }
    let inScriptDir = false, inAsiDir = false, scriptBase = '', asiBase = '';
    for (const d of scriptDirs) if (f.dir === d || f.dir.startsWith(d + path.sep)) { inScriptDir = true; scriptBase = d; }
    for (const d of asiDirs) if (f.dir === d || f.dir.startsWith(d + path.sep)) { inAsiDir = true; asiBase = d; }
    if (e === '.dll' && !n.endsWith('.net.dll')) { rows.push(row(f.full, f.name, 'GAME FOLDER', 'Helper library')); continue; }
    if (e === '.asi' || (inAsiDir && !inScriptDir && !MODEL_EXT.includes(e))) { rows.push(row(f.full, C.relOf(f.full, asiBase), 'GAME FOLDER', 'Plugin')); continue; }
    if (inScriptDir) { rows.push(row(f.full, 'scripts\\' + C.relOf(f.full, scriptBase), 'SCRIPT', '')); continue; }
    if (e === '.img') { rows.push(row(f.full, 'update\\' + mod + '\\' + f.name, 'OVERLOADER', 'Extra archive (Fusion loads it)')); continue; }
    if (e !== '.exe') {
      const like = findPlace(f);
      if (like) { const dest = like.Folder ? like.Folder + '\\' + f.name : f.name; rows.push(row(f.full, dest, /^scripts\\/i.test(dest) ? 'SCRIPT' : 'GAME FOLDER', like.Why)); continue; }
    }
    if (e !== '.exe' && e !== '.rpf' && e !== '.img') {
      let hit = null; try { hit = C.findInArchives(f.name); } catch (er) { /* */ }
      if (hit) { rows.push(archiveRow(f.full, hit, mod)); continue; }
    }
    if (DATA_EXT.includes(e)) { rows.push(row(f.full, '', 'MANUAL', 'Game file with no folder path - click it to choose where it goes')); continue; }
    if (e === '.exe') { rows.push(row(f.full, '', 'MANUAL', 'A program - run it yourself if the readme says so')); continue; }
    rows.push(row(f.full, '', 'MANUAL', /^\.(ini|cfg|xml|txt|json)$/.test(e) ? "Settings for a script mod you don't have yet - click it to choose its folder" : 'Not sure where this goes - click it to choose a folder'));
  }
  if (rows.some(r => r.Kind === 'DATA LINES')) for (const r of rows) if (r.Note.includes('an add-on may also need lines added')) r.Note = 'New model - packed; its game data lines are added below';
  const placed = new Set(rows.filter(r => r.Dest).map(r => lc(path.basename(r.Source))));
  for (const r of rows) if (r.Kind === 'MANUAL' && placed.has(lc(path.basename(r.Source)))) { r.Kind = 'SKIP'; r.Note = 'Another copy of this file in the mod - the first one is used'; }
  return { rows, warning };
}

// ---------------------------------------------------------------- checks before installing
const HELPERS = [
  { Name: 'ScriptHookDotNet', Words: /script\s*hook\s*(dot\s*)?\.?net|scripthookdotnet|shdn/i, Files: ['ScriptHookDotNet.asi', 'ScriptHookDotNet.dll'] },
  { Name: 'ScriptHook', Words: /\bscript\s*hook\b(?!\s*(dot\s*)?\.?net)/i, Files: ['ScriptHook.dll'] },
  { Name: 'Fusion Fix', Words: /fusion\s*fix/i, Files: ['plugins\\GTAIV.EFLC.FusionFix.asi'] },
  { Name: 'ZolikaPatch', Words: /zolika\s*patch/i, Files: ['ZolikaPatch.asi', 'plugins\\ZolikaPatch.asi'] },
  { Name: 'IV-SDK .NET', Words: /iv-?\s*sdk\s*\.?\s*net|ivsdkdotnet/i, Files: ['IVSDKDotNet.asi', 'plugins\\IVSDKDotNet.asi'] },
  { Name: 'IV Tweaker', Words: /iv\s*tweaker/i, Files: ['*tweaker*.asi', 'plugins\\*tweaker*.asi'] },
];
const wild = (pat) => new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
function helperThere(h, plan) {
  for (const f of h.Files) {
    const dir = J(E.game, C.parentRel(f)), lf = leaf(f);
    try { if (fs.readdirSync(dir).some(n => wild(lf).test(n))) return true; } catch (e) { /* */ }
    for (const r of plan) if (r.Dest && wild(lf).test(leaf(r.Dest))) return true;
  }
  return false;
}
function modChecks(root, plan) {
  const out = [];
  if (!E.game) return out;
  const placed = plan.filter(r => r.Dest && !['SKIP', 'MANUAL', 'PREVIEW'].includes(r.Kind));
  const hasNet = placed.some(r => /\.(net\.dll|cs|vb)$/i.test(r.Dest)), hasAsi = placed.some(r => /\.asi$/i.test(r.Dest));
  const readme = [];
  for (const f of walkFiles(root)) { const n = path.basename(f); if (/\.(txt|md|nfo)$/i.test(n) && !/licen[cs]e|gpl/i.test(n)) { try { if (fs.statSync(f).size < 1024 * 1024) readme.push(...readLines(f)); } catch (e) { /* */ } } }
  const text = readme.join('\n');
  for (const h of HELPERS) {
    let why = '';
    if (h.Name === 'ScriptHookDotNet' && hasNet) why = 'it has .NET scripts';
    else if (h.Words.test(text) && readme.some(l => h.Words.test(l) && /requir|need|must|dependen|prerequisite|install .* first/i.test(l) && !/method|option|alternative|if you (use|have|want|prefer)|instead/i.test(l))) why = 'the readme says it needs it';
    if (why && !helperThere(h, plan)) out.push('Needs ' + h.Name + ' (' + why + "). You don't have it. Without it the mod won't work in the game.");
  }
  if (hasAsi && !exists(J(E.game, 'dinput8.dll')) && !exists(J(E.game, 'xlive.dll'))) out.push("Has .asi plugins but you have no ASI loader (dinput8.dll), so they won't load. Fusion Fix comes with one.");
  if ((hasAsi || hasNet) && /\b1\.0\.(4|6|7|8)\.0\b|\b10[4678]0\b|downgrad/i.test(text)) out.push('The readme talks about old game versions (1.0.7 / 1.0.8 / downgrading). Its scripts may not work on the Complete Edition.');
  const ffFiles = new Set();
  for (const m of C.loadDb()) { if (!(m.Files || []).includes('plugins\\GTAIV.EFLC.FusionFix.asi')) continue; for (const f of m.Files) if (/^update\\/i.test(f)) ffFiles.add(C.gamePath(f)); }
  if (!ffFiles.size) for (const d of ['update\\common\\shaders', 'update\\pc\\data', 'update\\pc\\textures']) { const full = J(E.game, d); if (isDir(full)) for (const f of walkFiles(full)) ffFiles.add(C.gamePath(C.relOf(f, E.game))); }
  const clash = []; let shaders = false;
  for (const r of placed) { if (r.Kind !== 'OVERLOADER') continue; const gp = C.gamePath(r.Dest); if (/\\shaders\\/.test(gp)) shaders = true; if (ffFiles.has(gp)) clash.push(leaf(gp)); }
  if (shaders) out.push("Shader mod: most shader mods are older than Fusion Fix and can break it (for example invisible people). Fusion Fix's own shaders are always kept.");
  else if (clash.length) out.push('Replaces files Fusion Fix has its own version of: ' + clash.slice(0, 4).join(', ') + (clash.length > 4 ? '...' : '') + '. If something looks wrong in the game, turn this mod off.');
  const doneLeafs = [...new Set(placed.filter(r => C.MERGE_TARGETS.includes(C.gamePath(r.Dest))).map(r => leaf(r.Dest).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))];
  const doneData = doneLeafs.length ? new RegExp(doneLeafs.join('|'), 'i') : null;
  const hand = [];
  for (const l of readme) {
    const t = String(l).trim();
    if (t.length < 8 || t.length > 300) continue;
    if (/gta\.dat|images\.txt|default\.dat/i.test(t)) continue;
    if (doneData && doneData.test(t)) continue;
    if (/\badd (this|these|the following)\b.*\blines?\b|\b(open|edit)\b.*\.(ini|cfg|txt|xml|dat|ide|meta)\b|\breplace the line\b|\bchange the value\b|\bat the (bottom|end|top) of (your|the)\b/i.test(t)) hand.push(t.length > 120 ? t.substring(0, 117) + '...' : t);
  }
  if (hand.length) out.push("The readme asks you to do something by hand. The app can't do that for you:\n- " + hand.slice(0, 3).join('\n- '));
  return out;
}

// ---------------------------------------------------------------- loading a mod (unpack + plan)
const NEXUS_GAME = 'gta4';
// Nexus file names carry the mod number and version: "Name-1350-1-2-1727200000.zip" or "Name_1350_1_2026-09-24T20-48Z_X.zip"
function nexusFromName(fileName) {
  const st = stemOf(fileName);
  let m = /^(.+?)-(\d{1,6})-(\d+(?:-\d+)*)-(\d{9,11})$/.exec(st);
  if (!m) m = /^(.+?)_(\d{1,6})_(\d+(?:_\d+)*)_(\d{4}-\d\d-\d\dT[\d-]+Z)(?:_\w+)?$/.exec(st);
  if (!m) return null;
  return { Name: m[1].replace(/^[ \-_]+|[ \-_]+$/g, ''), Source: { Site: 'Nexus', NexusId: m[2], FileId: '', Version: m[3].replace(/[-_]/g, '.'), Uploaded: 0, Url: 'https://www.nexusmods.com/' + NEXUS_GAME + '/mods/' + m[2], Picture: '' } };
}
function loadMod(p) {
  resetIndexes();
  const tmp = expandMod(p);
  const fileName = path.basename(p);
  let name = stemOf(fileName).replace(/^[0-9_]+/, '').replace(/[ _-]*[0-9]{6,}.*$/, '').replace(/[_-]+/g, ' ');
  if (!C.cleanName(name)) name = stemOf(fileName);
  if (!C.cleanName(name)) name = 'Mod ' + new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '');
  const nx = nexusFromName(fileName);
  if (nx && C.cleanName(nx.Name)) name = nx.Name;
  let modName = C.cleanName(name), source = null;
  if (nx) {
    source = nx.Source;
    const have = C.loadDb().find(m => C.modSource(m) && String(C.modSource(m).NexusId) === String(nx.Source.NexusId));
    if (have) modName = String(have.Name);
  }
  const { rows, warning } = buildPlan(tmp, modName);
  if (rows.some(r => r.Kind === 'CORE')) modName = 'Fusion Fix';
  let checks = []; try { checks = modChecks(tmp, rows); } catch (e) { /* */ }
  return { temp: tmp, modName, source, rows, warning, checks, file: p };
}
// you pick the folder for a file the app couldn't place - remembered for next time
function chooseRowFolder(r, folderFull) {
  if (!lc(folderFull).startsWith(lc(E.game))) { const e = new Error('Please pick a folder inside your GTA IV folder:\n' + E.game); e.friendly = true; throw e; }
  const rel = C.relOf(folderFull, E.game).replace(/\\+$/, '');
  const name = path.basename(r.Source);
  r.Dest = rel ? rel + '\\' + name : name;
  r.Kind = /^scripts/i.test(rel) ? 'SCRIPT' : 'GAME FOLDER';
  r.Note = 'You chose this folder (remembered for next time)';
  saveLearned(name, rel);
  return r;
}

// ---------------------------------------------------------------- install / uninstall / on / off
async function offerArchiveBackup(archives) {
  for (const a of [...new Set(archives)]) {
    const bk = J(C.dataDir(), 'originals', a);
    if (exists(bk)) continue;
    const orig = J(E.game, a); if (!isFile(orig)) continue;
    const mb = Math.round(fs.statSync(orig).size / 1048576), lf = leaf(a);
    const r = await E.host.ask('This mod changes files inside ' + lf + '.\n\nYour original ' + lf + ' is never edited. A modded copy is built in the update folder, and uninstalling removes it.\n\nSave an extra backup of the original ' + lf + ' anyway? (Recommended, ' + mb + ' MB)', 'Create a backup?', ['Yes', 'No']);
    if (r === 'Yes') { status('Backing up ' + lf + '...', 'dim'); mkParent(bk); fs.copyFileSync(orig, bk); }
  }
}
async function installPlan(plan, opts) {
  opts = opts || {};
  let mods = C.loadDb();
  const mod = C.cleanName(plan.modName);
  if (!mod) { status('Give the mod a name first.', 'red'); return { ok: false }; }
  let source = plan.source || null;
  if (mods.some(m => m.Name === mod)) {
    const r = opts.replace ? 'Yes' : await E.host.ask("'" + mod + "' is already in My Mods. Replace it with this one?", 'Liberty City Mod Loader IV', ['Yes', 'No']);
    if (r !== 'Yes') return { ok: false };
    const oldSrc = C.modSource(mods.find(m => m.Name === mod));
    if (!source && oldSrc) source = oldSrc;
    uninstallMod(mod, true);
    mods = C.loadDb();
  }
  const checks = (plan.checks || []).filter(Boolean);
  if (checks.length && !opts.skipChecks) {
    const r = await E.host.ask("Before you install '" + mod + "':\n\n" + checks.map(c => '- ' + c).join('\n\n') + '\n\nInstall anyway?', 'Before you install', ['Yes', 'No']);
    if (r !== 'Yes') { status('Install cancelled. Nothing was changed.', 'dim'); return { ok: false }; }
  }
  const rows = plan.rows;
  const warn = [], gamePaths = new Map();
  const upd = J(E.game, 'update');
  if (isDir(upd)) for (const f of walkFiles(upd)) { const rel = C.relOf(f, E.game); gamePaths.set(C.gamePath(rel), rel); }
  for (const r of rows) {
    if (!r.Dest) continue;
    if (r.Kind !== 'CORE' && WRAPPERS.includes(lc(r.Dest)) && exists(J(E.game, r.Dest)) && !C.getOwner(r.Dest, mods)) {
      warn.push(r.Dest + "  (you already have one, from Fusion Fix or another graphics mod. It's backed up, and turning this mod off puts it back)"); continue;
    }
    const owner = C.getOwner(r.Dest, mods);
    if (r.Kind === 'ARCHIVE') {
      const pp = r.Dest.split('|');
      if (/\.wtd$/i.test(pp[1])) continue;
      for (const om of mods) { if (!C.isOn(om)) continue; for (const it of C.modArchives(om)) if (eqI(it.Archive, pp[0]) && eqI(String(it.Inner).replace(/^\?/, ''), pp[1].replace(/^\?/, ''))) warn.push(leaf(pp[0]) + ' > ' + pp[1].replace(/^\?/, '') + "  (also changed by '" + om.Name + "')"); }
      continue;
    }
    if (owner) warn.push(r.Dest + "  (belongs to '" + owner + "')");
    else if (r.Kind === 'OVERLOADER') {
      const gp = C.gamePath(r.Dest);
      if (gamePaths.has(gp) && !eqI(gamePaths.get(gp), r.Dest) && !C.MERGE_TARGETS.includes(gp) && !/\.wtd$/.test(gp) && !/^update\\LC Installer/i.test(gamePaths.get(gp))) warn.push(gp + '  (already replaced by ' + gamePaths.get(gp) + ')');
    }
  }
  if (warn.length && !opts.skipChecks) {
    let msg = 'This mod clashes with what you already have:\n\n' + warn.slice(0, 12).join('\n');
    if (warn.length > 12) msg += '\n...and ' + (warn.length - 12) + ' more';
    msg += '\n\nThe mod lower in My Mods wins. Install anyway?';
    const r = await E.host.ask(msg, 'Conflict check', ['Yes', 'No']);
    if (r !== 'Yes') { status('Install cancelled. Nothing was changed.', 'dim'); return { ok: false }; }
  }
  status("Putting '" + mod + "' in your library...", 'dim');
  const files = [];
  for (const r of rows) {
    if (!r.Dest || r.Kind === 'IMG' || r.Kind === 'ARCHIVE' || r.Kind === 'SKIP' || r.Kind === 'PREVIEW' || r.Kind === 'MANUAL') continue;
    const lf = C.libFile(mod, r.Dest); mkParent(lf); fs.copyFileSync(r.Source, lf);
    if (!files.some(x => eqI(x, r.Dest))) files.push(r.Dest);
    if (String(r.Note).startsWith('RTX Remix version of Fusion Fix')) { const keep = J(C.dataDir(), 'rtx-ff-fork', r.Dest); mkParent(keep); fs.copyFileSync(r.Source, keep); }
  }
  const imgRows = rows.filter(r => r.Kind === 'IMG');
  if (imgRows.length) {
    const rel = imgRows[0].Dest, dest = C.libFile(mod, rel); mkParent(dest);
    try { F.img.pack(imgRows.map(r => r.Source), dest); files.push(rel); } catch (e) { status("Couldn't pack the models: " + e.message, 'red'); }
  }
  const arcRows = rows.filter(r => r.Kind === 'ARCHIVE');
  const archives = [];
  if (arcRows.length) {
    await offerArchiveBackup(arcRows.map(r => r.Dest.split('|')[0]));
    const storeRel = 'archives\\' + mod, storeDir = J(C.dataDir(), storeRel);
    fs.mkdirSync(storeDir, { recursive: true });
    arcRows.forEach((r, i) => {
      const pp = r.Dest.split('|'); const name = String(i + 1).padStart(4, '0') + '_' + path.basename(r.Source);
      fs.copyFileSync(r.Source, path.join(storeDir, name));
      archives.push({ Archive: pp[0], Inner: pp[1], Store: storeRel + '\\' + name });
    });
  }
  const now = new Date(); const pad = (x) => String(x).padStart(2, '0');
  const entry = { Name: mod, Date: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()), Files: files, Backups: [], Enabled: true, Archives: archives, Library: true };
  if (source) entry.Source = Object.assign({}, source, { InstalledAt: Math.floor(Date.now() / 1000), Update: '' });
  // its picture for My Mods: the first preview picture in the mod, or its Nexus picture
  try {
    const pic = rows.find(r => r.Kind === 'PREVIEW' && isFile(r.Source));
    if (pic) await saveThumb(mod, pic.Source);
    else if (source && source.Picture) await saveThumbFromUrl(mod, source.Picture);
  } catch (e) { /* */ }
  mods = [...mods, entry];
  C.saveDb(mods);
  status("Putting '" + mod + "' in the game...", 'dim');
  C.syncFiles(files, mods);
  let packed = true;
  if (archives.length || C.touchesArchive(entry)) packed = C.rebuildArchives();
  const manual = rows.filter(r => r.Kind === 'MANUAL').length;
  const count = files.length + archives.length;
  if (!packed) { /* error already shown */ }
  else if (manual) status("Delivered '" + mod + "' (" + count + ' files). ' + manual + " file(s) couldn't be placed - see the list.", 'amber');
  else status("Delivered. '" + mod + "' has arrived in Liberty City (" + count + ' files).', 'green');
  if (plan.temp) rm(plan.temp);
  for (const r of rows) if (r.Kind === 'DATA LINES' && r.Source.startsWith(J(C.dataDir(), 'temp'))) rm(path.dirname(r.Source));   // the split-up notes files
  const rtx = rows.some(r => /(^|[\\/])rtx_comp[\\/]/i.test(r.Dest || ''));
  return { ok: true, name: mod, rtx };
}
function uninstallMod(name, quiet) {
  let mods = C.loadDb(); let m = mods.find(x => x.Name === name); if (!m) return;
  if (!C.inLib(m)) { C.convertToLibrary(); mods = C.loadDb(); m = mods.find(x => x.Name === name); }
  const rest = mods.filter(x => x.Name !== name);
  C.saveDb(rest);
  C.syncFiles(m.Files || [], rest);
  rm(J(C.dataDir(), 'library', name));
  if (C.touchesArchive(m)) { C.rebuildArchives(); rm(J(C.dataDir(), 'archives', name)); }
  try { fs.rmSync(thumbPath(name), { force: true }); } catch (e) { /* */ }
  if (!quiet) status("'" + name + "' shipped back out of Liberty City. Replaced files were restored.", 'green');
}
function disableMod(name) {
  let mods = C.loadDb(); let m = mods.find(x => x.Name === name); if (!m || !C.isOn(m)) return;
  if (!C.inLib(m)) { C.convertToLibrary(); mods = C.loadDb(); m = mods.find(x => x.Name === name); }
  m.Enabled = false; C.saveDb(mods);
  C.syncFiles(m.Files || [], mods);
  if (C.touchesArchive(m)) C.rebuildArchives();
  status("'" + name + "' is off. Its files are kept safe - turn it back on any time.", 'dim');
}
// On: its files go back in. If mods that are on have the same files, you choose who wins.
async function enableMod(name) {
  let mods = C.loadDb(); let m = mods.find(x => x.Name === name); if (!m || C.isOn(m)) return false;
  if (!C.inLib(m)) { C.convertToLibrary(); mods = C.loadDb(); m = mods.find(x => x.Name === name); }
  const others = mods.filter(x => x.Name !== name);
  const clash = [], clashMods = [];
  for (const rel of m.Files || []) {
    if (/\.wtd$/i.test(rel)) continue;   // texture files are mixed
    const o = C.getOwner(rel, others); if (o) { clash.push(rel + "  ('" + o + "')"); if (!clashMods.includes(o)) clashMods.push(o); }
  }
  for (const it of C.modArchives(m)) {
    if (/\.wtd$/i.test(it.Inner)) continue;
    for (const om of others) { if (!C.isOn(om)) continue; for (const x of C.modArchives(om)) if (eqI(x.Archive, it.Archive) && eqI(String(x.Inner).replace(/^\?/, ''), String(it.Inner).replace(/^\?/, ''))) { clash.push(leaf(it.Archive) + ' > ' + String(it.Inner).replace(/^\?/, '') + "  ('" + om.Name + "')"); if (!clashMods.includes(om.Name)) clashMods.push(om.Name); } }
  }
  if (clash.length) {
    let msg = "'" + name + "' changes the same files as: " + clashMods.join(', ') + '\n\n' + clash.slice(0, 8).join('\n');
    if (clash.length > 8) msg += '\n...and ' + (clash.length - 8) + ' more';
    const r = await E.host.ask(msg + '\n\nWhich files should be used?', 'Two mods, same files', [name + ' wins', 'Keep the other mod', 'Cancel']);
    if (r === 'Cancel' || !r) return false;
    if (r === name + ' wins') mods = [...others, m];
    else { let at = 0; for (let i = 0; i < others.length; i++) if (clashMods.includes(others[i].Name)) { at = i; break; } mods = [...others.slice(0, at), m, ...others.slice(at)]; }
  }
  m.Enabled = true; C.saveDb(mods);
  C.syncFiles(m.Files || [], mods);
  if (C.touchesArchive(m)) C.rebuildArchives();
  const missing = (m.Files || []).filter(f => f && !String(f).includes('|') && !exists(C.libFile(m.Name, f))).length;
  if (missing) status("'" + name + "' is on, but " + missing + " file(s) were missing. Reinstall it if it misbehaves.", 'amber');
  else status("'" + name + "' is back on.", 'green');
  return true;
}
// turns many mods on/off at once, with no questions (their order stays the same)
function setModsState(names, on) {
  names = (names || []).filter(Boolean); if (!names.length) return;
  C.convertToLibrary();
  const mods = C.loadDb(); const rels = []; let arc = false;
  for (const m of mods) {
    if (!names.includes(String(m.Name)) || C.isOn(m) === on) continue;
    m.Enabled = on; rels.push(...(m.Files || [])); if (C.touchesArchive(m)) arc = true;
  }
  if (!rels.length) return;
  C.saveDb(mods); C.syncFiles(rels, mods);
  if (arc) C.rebuildArchives();
}
function moveModOrder(name, to) {
  let mods = C.loadDb();
  const from = mods.findIndex(m => m.Name === name); if (from < 0) return;
  if (to > from) to--;
  to = Math.max(0, Math.min(mods.length - 1, to)); if (to === from) return;
  const [m] = mods.splice(from, 1); mods.splice(to, 0, m);
  C.saveDb(mods);
  if (C.isOn(m)) { status("Putting '" + name + "' in its new place...", 'dim'); C.syncFiles(m.Files || [], mods); if (C.touchesArchive(m)) C.rebuildArchives(); }
  status("'" + name + "' moved. Lower in the list wins when two mods change the same file.", 'green');
}
function renameMod(oldName, newName) {
  newName = C.cleanName(newName);
  const mods = C.loadDb(); const m = mods.find(x => x.Name === oldName);
  if (!m || !newName || newName === oldName) return false;
  if (mods.some(x => eqI(x.Name, newName))) { const e = new Error('You already have a mod called ' + newName + '.'); e.friendly = true; throw e; }
  // files stay where they are in the game; only the library folder and the list change
  const was = C.isOn(m);
  if (was) { m.Enabled = false; C.saveDb(mods); C.syncFiles(m.Files || [], mods); }
  const a = J(C.dataDir(), 'library', oldName), b = J(C.dataDir(), 'library', newName);
  if (isDir(a)) fs.renameSync(a, b);
  const sa = J(C.dataDir(), 'archives', oldName), sb = J(C.dataDir(), 'archives', newName);
  if (isDir(sa)) fs.renameSync(sa, sb);
  for (const it of C.modArchives(m)) it.Store = String(it.Store).replace(new RegExp('^archives\\\\' + oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), 'archives\\' + newName);
  try { if (isFile(thumbPath(oldName))) fs.renameSync(thumbPath(oldName), thumbPath(newName)); } catch (e) { /* */ }
  m.Name = newName;
  if (was) m.Enabled = true;
  C.saveDb(mods);
  if (was) C.syncFiles(m.Files || [], mods);
  return true;
}

// ---------------------------------------------------------------- pictures for My Mods
const thumbPath = (name) => J(C.dataDir(), 'thumbs', String(name).replace(/[\\/:*?"<>|]/g, '_') + '.png');
async function saveThumb(name, src) {
  const png = await E.host.image('thumb', { bytes: fs.readFileSync(src) });
  if (png) { const p = thumbPath(name); mkParent(p); fs.writeFileSync(p, Buffer.from(png)); }
}
async function saveThumbFromUrl(name, url) {
  if (!url) return;
  const res = await fetch(url, { headers: { 'User-Agent': 'LibertyCityModLoaderIV/1.0' } });
  if (!res.ok) return;
  const png = await E.host.image('thumb', { bytes: Buffer.from(await res.arrayBuffer()) });
  if (png) { const p = thumbPath(name); mkParent(p); fs.writeFileSync(p, Buffer.from(png)); }
}

module.exports = {
  DOC_EXT, DATA_EXT, IMG_EXT, WRAPPERS, NEXUS_GAME, gameVersion, verText, isCompleteEdition, find7z, findUnRar, expandMod, isDoc, buildPlan, splitLinesFile, isDataLine,
  modChecks, loadMod, chooseRowFolder, nexusFromName, installPlan, uninstallMod, disableMod, enableMod, setModsState, moveModOrder, renameMod,
  thumbPath, saveThumb, saveThumbFromUrl, resetIndexes, stemName, gameFileIndex, saveLearned, findArchivePath,
};
