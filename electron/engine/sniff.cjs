'use strict';
// The smart file reader: when a file's name and folder don't say where it goes, this looks INSIDE the file
// to tell what it really is - a texture file, a 3D model, a script, a plugin, map data - and finds its place.
// Everything runs on your PC, offline. Nothing is sent anywhere.
const fs = require('fs');
const path = require('path');
const F = require('./formats.cjs');
const C = require('./core.cjs');
const { E, J, lc, isDir, leaf, walkFiles } = C;

const GAME_ROOTS = ['pc', 'common', 'tlad', 'tbogt'];
const episodeFirst = (r) => (/^(tlad|tbogt)\\/i.test(r) ? 1 : 0);
const byMainGameFirst = (a, b) => episodeFirst(a) - episodeFirst(b) || a.length - b.length;

let looseIdx = null, texIdx = null, xmlRoots = null;
function reset() { looseIdx = null; texIdx = null; xmlRoots = null; }
// game data files a mod may replace by name
const GAME_DATA = /\.(wtd|wdr|wdd|wft|wbd|wbn|wad|dat|ide|ipl|wpl|xml|gxt|csv|nod|sco|whm|fxc|ivaud|oaf|wvd|wfd)$/i;

function head(full, n) {
  let fd; try { fd = fs.openSync(full, 'r'); const b = Buffer.alloc(n); const got = fs.readSync(fd, b, 0, n, 0); return b.subarray(0, got); } catch (e) { return Buffer.alloc(0); } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch (e) { /* */ } }
}
function readSmall(full, max) { try { const st = fs.statSync(full); if (st.size > max) return null; return fs.readFileSync(full); } catch (e) { return null; } }

// ---------------------------------------------------------------- the game's own loose files (not inside archives)
// name -> game paths, like "blips.wtd" -> "pc\textures\blips.wtd"
function looseIndex() {
  if (looseIdx) return looseIdx;
  looseIdx = new Map();
  if (!E.game) return looseIdx;
  for (const root of GAME_ROOTS) {
    const d = J(E.game, root); if (!isDir(d)) continue;
    for (const full of walkFiles(d)) {
      const rel = C.relOf(full, E.game);
      if (/\.(img|rpf)$/i.test(rel) || /^(pc|tlad\\pc|tbogt\\pc)\\audio\\/i.test(rel)) continue;
      const k = lc(leaf(rel)); if (!looseIdx.has(k)) looseIdx.set(k, []); looseIdx.get(k).push(rel);
    }
  }
  for (const [, v] of looseIdx) v.sort(byMainGameFirst);
  return looseIdx;
}
// the game file with this exact name, main game before the episodes
function looseGamePath(name) { const v = looseIndex().get(lc(name)); return v && v.length ? v[0] : null; }

// ---------------------------------------------------------------- texture names inside the game's own .wtd files
function textureIndex() {
  if (texIdx) return texIdx;
  texIdx = [];
  if (!E.game) return texIdx;
  const cachePath = J(C.dataDir(), 'texture-index.json');
  const cache = C.readJson(cachePath, {}) || {}, fresh = {};
  let changed = false;
  for (const [name, rels] of looseIndex()) {
    if (!name.endsWith('.wtd')) continue;
    for (const rel of rels) {
      let st; try { st = fs.statSync(J(E.game, rel)); } catch (e) { continue; }
      const sig = st.size + '|' + st.mtimeMs;
      let names = cache[rel] && cache[rel].Sig === sig ? cache[rel].Names : null;
      if (!names) { names = []; try { names = F.Wtd.load(fs.readFileSync(J(E.game, rel))).textures.map(t => lc(t.name)); } catch (e) { /* odd file */ } changed = true; }
      fresh[rel] = { Sig: sig, Names: names };
      if (names.length) texIdx.push({ rel, names: new Set(names) });
    }
  }
  if (changed || Object.keys(fresh).length !== Object.keys(cache).length) { try { fs.writeFileSync(cachePath, JSON.stringify(fresh)); } catch (e) { /* */ } }
  return texIdx;
}
// which game .wtd has (almost) the same pictures inside
function matchTextures(names) {
  if (!names.length) return null;
  const mine = new Set(names.map(lc));
  let best = null, bestScore = 0;
  for (const t of textureIndex()) {
    let same = 0; for (const n of mine) if (t.names.has(n)) same++;
    if (!same) continue;
    // most of the mod's pictures must be in that file
    const score = same / mine.size;
    if (score > bestScore || (score === bestScore && best && byMainGameFirst(t.rel, best.rel) < 0)) { bestScore = score; best = t; }
  }
  return best && bestScore >= 0.6 ? { rel: best.rel, score: bestScore } : null;
}

// ---------------------------------------------------------------- what the bytes say
// GTA IV resource files start with "RSC" and a type number
function resourceType(full) {
  const h = head(full, 12);
  if (h.length < 12 || h.readUInt32LE(0) !== 0x05435352) return null;
  const t = h.readUInt32LE(4);
  if (t === 8) return { ext: '.wtd', label: 'texture file' };
  if (t === 110) return { ext: '.wdr', label: '3D model' };
  if (t === 112) return { ext: '.wft', label: 'car / object 3D model' };
  return { ext: null, label: 'game resource' };
}

// Windows programs and libraries: .NET or not, and which mod tools they were made for
function programInfo(full) {
  const b = readSmall(full, 32 * 1024 * 1024);
  if (!b || b.length < 0x100 || b.readUInt16LE(0) !== 0x5A4D) return null;
  const pe = b.readUInt32LE(0x3C);
  if (pe + 0x18 > b.length || b.readUInt32LE(pe) !== 0x00004550) return null;
  const opt = pe + 0x18, magic = b.readUInt16LE(opt);
  const dirs = opt + (magic === 0x20B ? 0x70 : 0x60);
  const clr = dirs + 14 * 8 + 4 <= b.length ? b.readUInt32LE(dirs + 14 * 8) : 0;
  const text = b.toString('latin1');
  const pdb = (/[A-Za-z]:\\[^\0\r\n]{3,240}?\.pdb/.exec(text) || [''])[0];
  return {
    dotnet: clr !== 0,
    is64: magic === 0x20B,
    shdn: /ScriptHookDotNet/.test(text),
    ivsdkNet: /IVSDKDotNet/.test(text),
    // native mods built with IV-SDK (the old-version toolkit) say so in their build path
    ivsdkNative: /GTAIV_SDK|[\\/]iv-?sdk[\\/]/i.test(pdb) && !/IVSDKDotNet/i.test(pdb),
    pdb,
  };
}

// plain text: what kind of game data it is
function textKind(full) {
  const b = readSmall(full, 2 * 1024 * 1024); if (!b) return null;
  if (b.includes(0)) return null;
  const t = b.toString('latin1');
  const lines = t.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  if (!lines.length) return null;
  if (/^\s*using\s+GTA\s*;/m.test(t) || /Inherits\s+GTA\.Script/i.test(t) || /:\s*Script\b/.test(t) && /\bGTA\b/.test(t)) return { kind: 'shdn-source' };
  if (/^\s*using\s+IVSDKDotNet/m.test(t)) return { kind: 'ivsdk-source' };
  const sec = lines.filter(l => /^(objs|tobj|anim|2dfx|txdp|cars|peds|weap|mlo|tree|amat|hier|path|inst|grge|enex|pick|jump|tcyc|auzo|mult|cull|occl|vnod|link|blok|lodm|slow|zone|end)$/i.test(l)).length;
  if (sec >= 2 && lines.some(l => /^end$/i.test(l))) {
    const ipl = lines.some(l => /^(inst|grge|enex|cull|occl|zone|blok|lodm|vnod|link|slow|mult|pick|jump|tcyc|auzo)$/i.test(l));
    return { kind: ipl ? 'ipl' : 'ide' };
  }
  if (/^<\?xml|^</.test(lines[0])) { const root = (/<([A-Za-z_][\w.-]*)[\s>]/.exec(t.replace(/<\?xml[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '')) || [])[1]; return root ? { kind: 'xml', root: lc(root) } : null; }
  return null;
}

// ---------------------------------------------------------------- the decision
// returns { gp, kind, why } (gp = path inside the game folder, or '' with kind 'MANUAL'), or null if it can't tell
function identify(f) {
  const name = f.name, e = f.ext, n = lc(name);

  // 1. a file with the same name as one of the game's own loose files replaces it
  const same = looseGamePath(name);
  if (same && GAME_DATA.test(name)) return { gp: same, why: "Replaces the game's " + leaf(same) + ' (' + C.parentRel(same) + ')' };

  // 2. game resources: check what's really inside
  const rsc = resourceType(f.full);
  if (rsc) {
    if (rsc.ext === '.wtd') {
      let names = []; try { names = F.Wtd.load(fs.readFileSync(f.full)).textures.map(t => t.name); } catch (er) { /* */ }
      const m = matchTextures(names);
      if (m) return { gp: C.parentRel(m.rel) + '\\' + leaf(m.rel), why: 'Read inside: its pictures (' + names.slice(0, 3).join(', ') + (names.length > 3 ? '...' : '') + ') are the ones in ' + leaf(m.rel) + ', so it replaces that file' };
    }
    if (rsc.ext && e !== rsc.ext && !(rsc.ext === '.wdr' && e === '.wdd'))
      return { gp: '', kind: 'MANUAL', why: 'Read inside: this is a ' + rsc.label + ' (' + rsc.ext + '), but its name ends in ' + (e || 'nothing') + ' - rename it to ' + path.basename(name, e) + rsc.ext + ' and add it again' };
    return null; // a normal model / texture: the usual archive rules handle it
  }

  // 3. programs and libraries
  if (e === '.dll' || e === '.asi') {
    const p = programInfo(f.full); if (!p) return null;
    if (p.is64) return { gp: '', kind: 'MANUAL', why: "Read inside: this is a 64-bit file. GTA IV is 32-bit, so it can't load it" };
    if (p.dotnet && p.ivsdkNet && !p.shdn && e === '.dll' && !/^ivsdkdotnet/i.test(name)) {
      const nm = /\.ivsdk\.dll$/i.test(n) ? name : path.basename(name, e) + '.ivsdk.dll';
      return { gp: 'IVSDKDotNet\\scripts\\' + nm, why: 'Read inside: an IV-SDK .NET script' + (nm !== name ? ' (renamed to ' + nm + ' so it loads)' : ''), needs: 'IV-SDK .NET' };
    }
    if (p.dotnet && p.shdn && e === '.dll' && !/^(scripthookdotnet|scripthook)\b/i.test(name)) {
      const nm = /\.net\.dll$/i.test(n) ? name : path.basename(name, e) + '.net.dll';
      return { gp: 'scripts\\' + nm, kind: 'SCRIPT', why: 'Read inside: a ScriptHookDotNet script' + (nm !== name ? ' (renamed to ' + nm + ' so it loads)' : '') };
    }
    if (!p.dotnet && p.ivsdkNative && !/zolikapatch/i.test(name)) return { gp: '', kind: 'MANUAL', oldOnly: true, why: 'Read inside: made with IV-SDK, which only works on the old GTA IV (1.0.7 / 1.0.8) - not the Complete Edition' };
    return null;
  }

  // 4. text: scripts as source code, map data
  if (/^\.(cs|vb|txt|dat|ide|ipl|xml)$/.test(e) || !e) {
    const k = textKind(f.full); if (!k) return null;
    if (k.kind === 'shdn-source' && /^\.(cs|vb)$/.test(e)) return { gp: 'scripts\\' + name, kind: 'SCRIPT', why: 'Read inside: a ScriptHookDotNet script (source code)' };
    if (k.kind === 'ivsdk-source') return { gp: '', kind: 'MANUAL', why: 'Read inside: IV-SDK .NET source code - it has to be built first, check its readme' };
    if (k.kind === 'ide' || k.kind === 'ipl') return { gp: '', kind: 'MANUAL', why: 'Read inside: map data (' + k.kind.toUpperCase() + '). It also needs a line in gta.dat - check the readme for where it goes' };
    if (k.kind === 'xml') {
      // an .xml whose top tag matches one of the game's own .xml files replaces that file
      if (!xmlRoots) {
        xmlRoots = new Map();
        for (const [nm, rels] of looseIndex()) {
          if (!nm.endsWith('.xml')) continue;
          const gx = textKind(J(E.game, rels[0]));
          if (gx && gx.kind === 'xml' && !xmlRoots.has(gx.root)) xmlRoots.set(gx.root, rels[0]);
        }
      }
      const hit = k.root.length > 3 ? xmlRoots.get(k.root) : null;
      if (hit) return { gp: hit, why: 'Read inside: it has the same layout (<' + k.root + '>) as the game\'s ' + leaf(hit) + ', so it replaces it' };
    }
  }
  return null;
}

module.exports = { identify, looseGamePath, resourceType, programInfo, textKind, matchTextures, reset };
