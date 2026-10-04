'use strict';
// GTA IV models (.wdr objects, .wft cars and other breakable things, .wdd characters) -> simple meshes for the 3D preview.
// The model layout comes from SparkIV / RageLib by Aru and ahmed605 (GPL v3).
const zlib = require('zlib');
const F = require('./formats.cjs');

const err = (m) => { const e = new Error(m); e.friendly = true; return e; };
const mem = (a, b) => (a << (b + 8)) >>> 0;

// the resource file -> its two memory parts
function unpack(file) {
  if (!file || file.length < 16 || file.readUInt32LE(0) !== 0x05435352) throw err("This isn't a GTA IV model file.");
  const type = file.readUInt32LE(4);
  if (file[12] !== 0x78) throw err("This model is packed in a way that isn't supported (console version?).");
  const flags = file.readUInt32LE(8);
  const sysSize = mem(flags & 0x7FF, (flags >>> 11) & 0xF), gfxSize = mem((flags >>> 15) & 0x7FF, (flags >>> 26) & 0xF);
  let all;
  try { all = zlib.inflateSync(file.subarray(12)); } catch (e) { all = zlib.inflateRawSync(file.subarray(14), { finishFlush: zlib.constants.Z_SYNC_FLUSH }); }
  const full = Buffer.alloc(sysSize + gfxSize); all.copy(full, 0, 0, Math.min(all.length, full.length));
  return { type, sys: full.subarray(0, sysSize), gfx: full.subarray(sysSize) };
}

class R {
  constructor(sys, gfx) { this.s = sys; this.g = gfx; }
  u8(a) { return this.s[a]; }
  u16(a) { return this.s.readUInt16LE(a); }
  u32(a) { return this.s.readUInt32LE(a); }
  f32(a) { return this.s.readFloatLE(a); }
  // pointer into the first part (5) or the second part (6); -1 = none
  p(a, nib = 5) { if (a < 0 || a + 4 > this.s.length) return -1; const v = this.s.readUInt32LE(a); if (v === 0 || (v >>> 28) !== nib) return -1; const o = v & 0x0FFFFFFF; return o < (nib === 5 ? this.s.length : this.g.length) ? o : -1; }
  str(a) { let e = a; while (e < this.s.length && this.s[e] !== 0) e++; return this.s.toString('latin1', a, e); }
  ptrs(a) { const list = this.p(a), n = this.u16(a + 4), r = []; if (list < 0) return r; for (let i = 0; i < n; i++) { const x = this.p(list + i * 4); if (x >= 0) r.push(x); } return r; }
}

const half = (h) => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; if (e === 0) return s * m * 5.960464477539063e-8; if (e === 31) return m ? NaN : s * Infinity; return s * Math.pow(2, e - 15) * (1 + m / 1024); };
const SIZE = [2, 4, 6, 8, 4, 8, 12, 16, 4, 4, 4, 0, 0, 0, 0, 0];
// read up to n numbers of one vertex part
function readEl(b, o, type, n) {
  const r = [0, 0, 0, 0];
  switch (type) {
    case 0: case 1: case 2: case 3: for (let i = 0; i <= type && i < n; i++) r[i] = half(b.readUInt16LE(o + i * 2)); break;
    case 4: case 5: case 6: case 7: for (let i = 0; i <= type - 4 && i < n; i++) r[i] = b.readFloatLE(o + i * 4); break;
    case 8: case 9: for (let i = 0; i < 4; i++) r[i] = b[o + i] / 255; break;
    case 10: { const v = b.readUInt32LE(o); const s = (x) => { x &= 1023; return (x & 512 ? x - 1024 : x) / 511; }; r[0] = s(v); r[1] = s(v >> 10); r[2] = s(v >> 20); break; }
  }
  return r;
}

function readTexDict(rd, at) {
  const out = new Map();
  if (at < 0) return out;
  try {
    const list = rd.p(at + 24), n = rd.u16(at + 28);
    for (let i = 0; i < n && list >= 0; i++) {
      const ti = rd.p(list + i * 4); if (ti < 0) continue;
      let name = rd.str(rd.p(ti + 20)); if (name.startsWith('pack:/')) name = name.substring(6); if (/\.dds$/i.test(name)) name = name.slice(0, -4);
      const t = { name, width: rd.u16(ti + 28), height: rd.u16(ti + 30), format: rd.s.readInt32LE(ti + 32), levels: Math.max(1, rd.u8(ti + 39)), dataOffset: rd.p(ti + 72, 6), gfx: rd.g };
      if (t.dataOffset >= 0) out.set(name.toLowerCase(), t);
    }
  } catch (e) { /* no pictures inside */ }
  return out;
}

function readShaders(rd, sg) {
  const shaders = [];
  if (sg < 0) return { shaders, texDict: -1 };
  const texDict = rd.p(sg + 4);
  for (const sh of rd.ptrs(sg + 8)) {
    const info = { diffuse: null, name: '' };
    try {
      const offs = rd.p(sh + 20), n = rd.s.readInt32LE(sh + 28), types = rd.p(sh + 36), names = rd.p(sh + 52);
      for (let i = 0; i < n && i < 64; i++) {
        if (rd.u8(types + i) !== 0) continue;
        const hash = rd.u32(names + i * 4); const po = rd.p(offs + i * 4); if (po < 0) continue;
        const tn = rd.p(po + 20); if (tn < 0) continue;
        let name = rd.str(tn); if (/\.dds$/i.test(name)) name = name.slice(0, -4);
        if (hash === 0x2b5170fd || (!info.diffuse && hash !== 0x46b7c64f && hash !== 0x608799c6)) info.diffuse = name;
      }
      const np = rd.p(sh + 68); if (np >= 0) info.name = rd.str(np);
    } catch (e) { /* skip */ }
    shaders.push(info);
  }
  return { shaders, texDict };
}

// one drawable -> meshes (only the most detailed version of the model)
function readDrawable(rd, at, shared) {
  const sg = rd.p(at + 8);
  let { shaders, texDict } = readShaders(rd, sg);
  if (!shaders.length && shared) shaders = shared.shaders;
  const meshes = [];
  const lod = rd.p(at + 64); if (lod < 0) return { meshes, shaders, texDict };
  for (const m of rd.ptrs(lod)) {
    const geos = rd.ptrs(m + 4), map = rd.p(m + 16);
    geos.forEach((g, gi) => {
      try {
        const vb = rd.p(g + 12), ib = rd.p(g + 28);
        const faces = rd.u32(g + 48), vcount = rd.u16(vb + 4);
        let vdata = rd.p(vb + 8, 6); if (vdata < 0) vdata = rd.p(vb + 24, 6); const stride = rd.u32(vb + 12), decl = rd.p(vb + 16);
        const icount = rd.u32(ib + 4), idata = rd.p(ib + 8, 6);
        if (vdata < 0 || idata < 0 || decl < 0 || !vcount) return;
        const usage = rd.u32(decl), types = rd.s.readBigUInt64LE(decl + 8);
        // where each part sits inside one vertex
        let off = 0; const where = {};
        for (let i = 0; i < 16; i++) {
          const t = Number((types >> BigInt(4 * i)) & 15n);
          if (usage & (1 << i)) { where[i] = { off, t }; off += SIZE[t]; }
        }
        if (!where[0]) return;
        const pos = new Float32Array(vcount * 3), nrm = new Float32Array(vcount * 3), uv = new Float32Array(vcount * 2), col = new Float32Array(vcount * 4);
        const G = rd.g;
        for (let v = 0; v < vcount; v++) {
          const base = vdata + v * stride; if (base + stride > G.length) break;
          const p = readEl(G, base + where[0].off, where[0].t, 3); pos.set([p[0], p[1], p[2]], v * 3);
          if (where[3]) { const n = readEl(G, base + where[3].off, where[3].t, 3); nrm.set([n[0], n[1], n[2]], v * 3); }
          if (where[6]) { const t = readEl(G, base + where[6].off, where[6].t, 2); uv.set([t[0], t[1]], v * 2); }
          if (where[4]) { const c = readEl(G, base + where[4].off, where[4].t, 4); col.set([c[2], c[1], c[0], c[3]], v * 4); } else col.fill(1, v * 4, v * 4 + 4);
        }
        const n = Math.min(icount, faces * 3 || icount);
        const idx = new Uint16Array(n); for (let i = 0; i < n; i++) idx[i] = G.readUInt16LE(idata + i * 2);
        const si = map >= 0 ? rd.u16(map + gi * 2) : 0;
        const sh = shaders[si] || {};
        meshes.push({ pos, nrm, uv, col, idx, hasNormal: !!where[3], hasColor: !!where[4], texture: sh.diffuse || null, shader: sh.name || '' });
      } catch (e) { /* skip a broken piece */ }
    });
  }
  return { meshes, shaders, texDict };
}

// a copy of meshes put at a spot (and turned half way round for the other side)
function moved(meshes, at, turn) {
  return meshes.map(m => {
    const pos = new Float32Array(m.pos.length), nrm = new Float32Array(m.nrm.length);
    for (let i = 0; i < m.pos.length; i += 3) {
      const sx = turn ? -1 : 1;
      pos[i] = m.pos[i] * sx + at[0]; pos[i + 1] = m.pos[i + 1] * sx + at[1]; pos[i + 2] = m.pos[i + 2] + at[2];
      nrm[i] = m.nrm[i] * sx; nrm[i + 1] = m.nrm[i + 1] * sx; nrm[i + 2] = m.nrm[i + 2];
    }
    return Object.assign({}, m, { pos, nrm });
  });
}

// names of character parts, so the window can show them by name (the game only keeps a number made from the name)
const PED_PARTS = ['head', 'uppr', 'lowr', 'suse', 'hand', 'feet', 'jack', 'hair', 'teef', 'decl', 'accs', 'task', 'face', 'eyes'];
const RACES = ['u', 'r', 'w', 'b', 'a', 'l', 'm', 'o', 's', 'i', 'c', 'h', 'z'];
let pedNames = null;
function nameHash(s) { let h = 0; s = s.toLowerCase(); for (let i = 0; i < s.length; i++) { h = (h + s.charCodeAt(i)) >>> 0; h = (h + (h << 10)) >>> 0; h = (h ^ (h >>> 6)) >>> 0; } h = (h + (h << 3)) >>> 0; h = (h ^ (h >>> 11)) >>> 0; h = (h + (h << 15)) >>> 0; return h >>> 0; }
function pedName(hash) {
  if (!pedNames) {
    pedNames = new Map();
    for (const p of PED_PARTS) for (let i = 0; i < 40; i++) for (const r of RACES) { const n = p + '_' + String(i).padStart(3, '0') + '_' + r; pedNames.set(nameHash(n), n); }
    for (const n of ['body', 'head', 'player', 'lod']) pedNames.set(nameHash(n), n);
  }
  return pedNames.get(hash >>> 0) || null;
}

// file bytes + its file name -> { kind, parts: [{name, show, meshes}], textures: Map(name -> texture), want: [texture names] }
function read(bytes, fileName) {
  const { type, sys, gfx } = unpack(bytes);
  const rd = new R(sys, gfx);
  const ext = String(fileName || '').toLowerCase().split('.').pop();
  const parts = []; const texDicts = [];
  let kind;
  if (type === 112 || ext === 'wft') {
    kind = 'car';
    const main = rd.p(0xB4); if (main < 0) throw err('No model in this file.');
    const d = readDrawable(rd, main);
    parts.push({ name: 'Body', show: true, meshes: d.meshes }); texDicts.push(d.texDict);
    // the bones: where the wheels (and other loose pieces) sit
    const bones = [];
    try {
      const sk = rd.p(main + 12);
      if (sk >= 0) { const bl = rd.p(sk), bn = rd.u16(sk + 20); for (let i = 0; i < bn && bl >= 0; i++) { const b = bl + i * 224; bones.push({ name: rd.str(rd.p(b)).toLowerCase(), at: [rd.f32(b + 96), rd.f32(b + 100), rd.f32(b + 104)] }); } }
    } catch (e) { /* no bones */ }
    const wheelOf = (nm) => { const m = /^wheel_(l|r)?(f|m|r)[a-z0-9]*$/.exec(nm || ''); return m ? { right: m[1] === 'r', front: m[2] === 'f' } : null; };
    const n = rd.u8(0x1F3), list = rd.p(0xD4);
    const placed = new Set(); let front = null, rear = null; const others = [];
    for (let i = 0; i < n && list >= 0; i++) {
      const c = rd.p(list + i * 4); if (c < 0) continue;
      const cd = rd.p(c + 0x90); if (cd < 0) continue;
      const x = readDrawable(rd, cd, d); if (!x.meshes.length) continue;
      const bi = rd.u16(c + 0x0e), bone = bones[bi], w = bone && wheelOf(bone.name);
      if (w) {
        if (w.front && !front) front = { meshes: x.meshes, right: w.right };
        if (!w.front && !rear) rear = { meshes: x.meshes, right: w.right };
        placed.add(bi); parts.push({ name: 'Wheel', show: true, meshes: moved(x.meshes, bone.at, false) });
      } else others.push({ x, bone });
    }
    // the game uses one wheel for every wheel spot - copy it to the empty spots (turned around on the other side)
    bones.forEach((b, bi) => {
      const w = wheelOf(b.name); if (!w || placed.has(bi)) return;
      const src = (w.front ? front || rear : rear || front); if (!src) return;
      parts.push({ name: 'Wheel', show: true, meshes: moved(src.meshes, b.at, w.right !== src.right) });
    });
    others.forEach((o, k) => parts.push({ name: 'Piece ' + (k + 1), show: false, meshes: o.bone ? moved(o.x.meshes, o.bone.at, false) : o.x.meshes }));
    // all wheels as one part in the list
    const wheels = parts.filter(p => p.name === 'Wheel');
    if (wheels.length) { const keep = parts.filter(p => p.name !== 'Wheel'); keep.splice(1, 0, { name: 'Wheels', show: true, meshes: wheels.flatMap(p => p.meshes) }); parts.length = 0; parts.push(...keep); }
  } else if (ext === 'wdd' || (type === 110 && rd.u32(12) === 1 && rd.p(8) < 0)) {
    kind = 'character';
    const hashes = rd.p(16), ents = rd.ptrs(24);
    const seen = new Set();
    ents.forEach((e, i) => {
      const d = readDrawable(rd, e); texDicts.push(d.texDict);
      const h = hashes >= 0 ? rd.u32(hashes + i * 4) : 0;
      const nm = pedName(h);
      // show the first look of every body part; other looks can be turned on in the window
      const group = nm ? nm.split('_')[0] : null;
      const show = !nm || (!seen.has(group) && /_000_/.test(nm)) || (!seen.has(group) && !/_\d{3}_/.test(nm));
      if (show && group) seen.add(group);
      parts.push({ name: nm || ('Part ' + (i + 1)), show, meshes: d.meshes });
    });
    // nothing named: show everything
    if (!parts.some(p => p.show)) parts.forEach(p => { p.show = true; });
  } else if (type === 110 || ext === 'wdr') {
    kind = /^(head|uppr|lowr|suse|hand|feet|jack|hair|teef|decl|accs|task|player|face)[_.]/i.test(String(fileName || '').split(/[\\/]/).pop()) ? 'character' : 'object';
    const d = readDrawable(rd, 0); parts.push({ name: 'Model', show: true, meshes: d.meshes }); texDicts.push(d.texDict);
  } else throw err("This file type can't be shown in 3D.");
  const textures = new Map();
  for (const t of texDicts) for (const [k, v] of readTexDict(rd, t)) if (!textures.has(k)) textures.set(k, v);
  const want = new Set(); for (const p of parts) for (const m of p.meshes) if (m.texture) want.add(m.texture.toLowerCase());
  if (!parts.some(p => p.meshes.length)) throw err('No 3D shape found in this file.');
  return { kind, parts, textures, want: [...want] };
}

// a texture (from the model or a .wtd) -> small enough picture for the preview
function texturePicture(t, max = 1024) {
  let l = 0; while (l < t.levels - 1 && (Math.max(1, t.width >> l) > max || Math.max(1, t.height >> l) > max)) l++;
  let o = t.dataOffset; for (let i = 0; i < l; i++) o += F.levelSize(t, i);
  const w = Math.max(1, t.width >> l), h = Math.max(1, t.height >> l);
  return { width: w, height: h, bgra: F.decode(t.gfx, o, w, h, t.format) };
}
// textures from a .wtd file
function wtdTextures(bytes) {
  const w = F.Wtd.load(bytes); const out = new Map();
  for (const t of w.textures) out.set(t.name.toLowerCase(), Object.assign({}, t, { gfx: w.gfx }));
  return out;
}

module.exports = { read, texturePicture, wtdTextures, unpack, nameHash };
