'use strict';
// GTA IV file formats: .rpf (v2) archives, .img (v3) archives, .wtd texture dictionaries, plus .zip reading.
// The .wtd layout (pgDictionary / grcTexturePC) follows SparkIV's RageLib by Aru and ahmed605 (GPL v3).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

function err(msg) { const e = new Error(msg); e.friendly = true; return e; }

// ---------------------------------------------------------------- AES (same key for .rpf and .img)
const KEY_HASH = 'DEA375EF1E6EF2223A1221C2C575C47BF17EFA5E';
const KNOWN_OFFSETS = [0xC5B73C, 0xC5B33C, 0xC95FD8, 0xBE7540, 0xBE6540, 0xBE1370, 0xB7AEF4, 0xB75C9C, 0xB56BC4,
  0xB607C4, 0xA94204, 0xB5B65C, 0xB569F4, 0xB76CB4, 0xB7AEFC, 0xB8813C, 0xB8C38C, 0xBE6510];
const keyState = { override: null, lastOffset: -1 };
function isKey(buf, off) {
  if (off < 0 || off + 32 > buf.length) return false;
  return crypto.createHash('sha1').update(buf.subarray(off, off + 32)).digest('hex').toUpperCase() === KEY_HASH;
}
function findKey(exePath, hint) {
  if (keyState.override) return keyState.override;
  const buf = fs.readFileSync(exePath);
  let found = -1;
  if (isKey(buf, hint)) found = hint;
  if (found < 0) for (const o of KNOWN_OFFSETS) if (isKey(buf, o)) { found = o; break; }
  if (found < 0) for (let o = 0; o + 32 <= buf.length; o += 4) if (isKey(buf, o)) { found = o; break; }
  if (found < 0) return null;
  keyState.lastOffset = found;
  return Buffer.from(buf.subarray(found, found + 32));
}
function aes(data, key, decrypt) {
  const d = Buffer.from(data);
  const len = d.length & ~0x0F;
  if (len <= 0) return d;
  let part = d.subarray(0, len);
  for (let i = 0; i < 16; i++) {
    const c = decrypt ? crypto.createDecipheriv('aes-256-ecb', key, null) : crypto.createCipheriv('aes-256-ecb', key, null);
    c.setAutoPadding(false);
    part = Buffer.concat([c.update(part), c.final()]);
  }
  part.copy(d, 0);
  return d;
}
const decrypt = (d, k) => aes(d, k, true);
const encrypt = (d, k) => aes(d, k, false);

function readAt(fd, pos, len) {
  const b = Buffer.alloc(len);
  let got = 0;
  while (got < len) { const r = fs.readSync(fd, b, got, len - got, pos + got); if (r <= 0) throw err('The archive ended early.'); got += r; }
  return b;
}

// ---------------------------------------------------------------- RPF v2
const BLOCK = 0x800, MAGIC_V2 = 0x32465052;
function rpfLoad(file, key) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const h = readAt(fd, 0, 20);
    const magic = h.readInt32LE(0), tocSize = h.readInt32LE(4), count = h.readInt32LE(8), unknown = h.readInt32LE(12), enc = h.readInt32LE(16);
    if (magic !== MAGIC_V2) throw err(magic === 0x33465052 ? "This archive type (version 3, used for audio) can't be edited." : "This isn't a GTA IV archive.");
    if (count <= 0 || tocSize < count * 16 || tocSize > 64 * 1024 * 1024) throw err('The archive looks damaged.');
    let toc = readAt(fd, BLOCK, tocSize);
    if (enc !== 0) { if (!key) throw err("Couldn't find the archive key in GTAIV.exe."); toc = decrypt(toc, key); }
    const names = toc.subarray(count * 16);
    const A = [], B = [], C = [], D = [];
    for (let i = 0; i < count; i++) { A.push(toc.readInt32LE(i * 16)); B.push(toc.readInt32LE(i * 16 + 4)); C.push(toc.readInt32LE(i * 16 + 8)); D.push(toc.readUInt32LE(i * 16 + 12)); }
    if (C[0] >= 0) throw err("Couldn't read the archive (wrong key?).");
    const seen = new Array(count).fill(false);
    const name = (off) => { if (off < 0 || off >= names.length) throw err('bad name'); let e = off; while (e < names.length && names[e] !== 0) e++; return names.toString('latin1', off, e); };
    const make = (i) => {
      if (i < 0 || i >= count || seen[i]) throw err("Couldn't read the archive (wrong key?).");
      seen[i] = true;
      const n = { name: name(A[i]), dir: false, kids: [] };
      if (C[i] < 0) {
        n.dir = true; n.dirFlags = B[i];
        const first = (C[i] >>> 0) & 0x7fffffff, num = D[i] & 0x0fffffff;
        if (first + num > count) throw err("Couldn't read the archive (wrong key?).");
        for (let k = 0; k < num; k++) n.kids.push(make(first + k));
      } else {
        n.size = B[i];
        if (((D[i] & 0xC0000000) >>> 0) === 0xC0000000) { n.resource = true; n.resType = C[i] & 0xFF; n.offset = C[i] & 0x7fffff00; n.sizeInArchive = B[i]; n.rscFlags = D[i]; }
        else { n.offset = C[i]; n.sizeInArchive = (D[i] & 0xbfffffff) >>> 0; n.compressed = (D[i] & 0x40000000) !== 0; }
        if (n.offset < 0 || n.offset + n.sizeInArchive > size) throw err("Couldn't read the archive (wrong key?).");
      }
      return n;
    };
    return { root: make(0), unknown };
  } finally { fs.closeSync(fd); }
}
function rpfWalk(n, p, all) { for (const k of n.kids) { const q = p ? p + '/' + k.name : k.name; all.push([q, k]); if (k.dir) rpfWalk(k, q, all); } }
function rpfList(file, key) {
  const { root } = rpfLoad(file, key); const all = []; rpfWalk(root, '', all);
  return all.map(([p, n]) => (n.dir ? 'D ' : 'F ') + p + (n.dir ? '' : ' ' + n.size + (n.resource ? ' rsc' + n.resType : '')));
}
function inflateTry(data, size) {
  for (const fn of [() => zlib.inflateRawSync(data), () => zlib.inflateSync(data)]) {
    try { const o = fn(); if (o.length === size) return o; } catch (e) { /* next */ }
  }
  throw err("Couldn't unpack this file.");
}
function rpfExtract(file, key, inner) {
  const { root } = rpfLoad(file, key); const all = []; rpfWalk(root, '', all);
  const want = inner.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
  for (const [p, n] of all) {
    if (n.dir || p.toLowerCase() !== want) continue;
    const fd = fs.openSync(file, 'r');
    try { const b = readAt(fd, n.offset, n.sizeInArchive); return (n.compressed && !n.resource) ? inflateTry(b, n.size) : b; } finally { fs.closeSync(fd); }
  }
  return null;
}
function cmpI(a, b) { a = a.toLowerCase(); b = b.toLowerCase(); return a < b ? -1 : a > b ? 1 : 0; }
function rpfInsert(dir, n) { let i = 0; while (i < dir.kids.length && cmpI(dir.kids[i].name, n.name) < 0) i++; dir.kids.splice(i, 0, n); }
function rpfSetSource(n, src) {
  n.newSource = src;
  const len = fs.statSync(src).size;
  const head = Buffer.alloc(12); const fd = fs.openSync(src, 'r'); fs.readSync(fd, head, 0, 12, 0); fs.closeSync(fd);
  n.size = len; n.sizeInArchive = len; n.compressed = false;
  if (head.readUInt32LE(0) === 0x05435352) { n.resource = true; n.resType = head.readUInt32LE(4) & 0xFF; n.rscFlags = (head.readUInt32LE(8) | 0xC0000000) >>> 0; }
  else { n.resource = false; n.resType = 0; n.rscFlags = 0; }
}
// inner: path inside with '/', or "?name" = that file name anywhere. Returns a short report.
function rpfBuild(original, output, key, inner, sources) {
  const { root, unknown } = rpfLoad(original, key);
  const report = [];
  const part = /^[a-z0-9]+_(diff_|normal_|spec_)?\d{3}_/i;
  for (let i = 0; i < inner.length; i++) {
    const all = []; rpfWalk(root, '', all);
    let want = inner[i].replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const byName = want.startsWith('?'); if (byName) want = want.substring(1);
    const file = want.includes('/') ? want.substring(want.lastIndexOf('/') + 1) : want;
    let hit = null, hitPath = null;
    for (const [p, n] of all) {
      if (n.dir) continue;
      if (byName ? n.name.toLowerCase() === file.toLowerCase() : p.toLowerCase() === want.toLowerCase()) { hit = n; hitPath = p; break; }
    }
    if (hit) { rpfSetSource(hit, sources[i]); report.push('replaced ' + hitPath); continue; }
    let dir = root, where = '';
    if (byName) {
      const pre = file.includes('_') ? file.substring(0, file.indexOf('_') + 1) : file;
      let best = 0;
      for (const [p, n] of all) { if (!n.dir) continue; let c = 0; for (const k of n.kids) if (!k.dir && k.name.toLowerCase().startsWith(pre.toLowerCase())) c++; if (c > best) { best = c; dir = n; where = p; } }
      if (best === 0) {
        for (const [p, n] of all) { if (!n.dir) continue; let c = 0; for (const k of n.kids) if (!k.dir && part.test(k.name)) c++; if (c > best) { best = c; dir = n; where = p; } }
        if (best === 0) { let rp = 0; for (const k of root.kids) if (!k.dir && part.test(k.name)) rp++; if (rp === 0) { dir = root; where = ''; } }
      }
    } else if (want.includes('/')) {
      for (const seg of want.substring(0, want.lastIndexOf('/')).split('/')) {
        let next = dir.kids.find(k => k.dir && k.name.toLowerCase() === seg.toLowerCase());
        if (!next) { next = { name: seg.toLowerCase(), dir: true, dirFlags: 0, kids: [] }; rpfInsert(dir, next); }
        dir = next; where = where ? where + '/' + next.name : next.name;
      }
    }
    const nn = { name: file.toLowerCase(), dir: false, kids: [] };
    rpfSetSource(nn, sources[i]); rpfInsert(dir, nn);
    report.push('added ' + (where ? where + '/' + nn.name : nn.name));
  }
  rpfWrite(original, output, root, unknown);
  return report.join('\n') + '\n';
}
const align = (v, a = BLOCK) => Math.ceil(v / a) * a;
function rpfWrite(original, output, root, unknown) {
  const list = [root];
  for (let i = 0; i < list.length; i++) { const n = list[i]; if (n.dir) { n.outIndex = list.length; list.push(...n.kids); } }
  const nameBufs = []; let nl = 0;
  for (const n of list) { n.nameOff = nl; const b = Buffer.from(n.name + '\0', 'latin1'); nameBufs.push(b); nl += b.length; }
  const names = Buffer.concat(nameBufs);
  const tocSize = list.length * 16 + names.length;
  let pos = align(BLOCK + tocSize);
  for (const n of list) { if (n.dir) continue; n.outOffset = pos; pos += align(Math.max(1, n.sizeInArchive)); if (pos > 0x7fffffff) throw err('The modded archive would be too big.'); }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const tmp = output + '.building';
  const src = fs.openSync(original, 'r'), o = fs.openSync(tmp, 'w');
  try {
    const h = Buffer.alloc(20); h.writeInt32LE(MAGIC_V2, 0); h.writeInt32LE(tocSize, 4); h.writeInt32LE(list.length, 8); h.writeInt32LE(unknown, 12); h.writeInt32LE(0, 16);
    fs.writeSync(o, h, 0, 20, 0);
    const toc = Buffer.alloc(list.length * 16);
    list.forEach((n, i) => {
      const at = i * 16; toc.writeInt32LE(n.nameOff, at);
      if (n.dir) { toc.writeInt32LE(n.dirFlags | 0, at + 4); toc.writeUInt32LE((n.outIndex | 0x80000000) >>> 0, at + 8); toc.writeInt32LE(n.kids.length, at + 12); }
      else if (n.resource) { toc.writeInt32LE(n.size, at + 4); toc.writeInt32LE(n.outOffset | (n.resType & 0xFF), at + 8); toc.writeUInt32LE(n.rscFlags >>> 0, at + 12); }
      else { toc.writeInt32LE(n.size, at + 4); toc.writeInt32LE(n.outOffset, at + 8); toc.writeUInt32LE((n.sizeInArchive | (n.compressed ? 0x40000000 : 0)) >>> 0, at + 12); }
    });
    fs.writeSync(o, toc, 0, toc.length, BLOCK); fs.writeSync(o, names, 0, names.length, BLOCK + toc.length);
    const buf = Buffer.alloc(1 << 16);
    for (const n of list) {
      if (n.dir) continue;
      let left = n.sizeInArchive, rpos = n.newSource ? 0 : n.offset, wpos = n.outOffset;
      const from = n.newSource ? fs.openSync(n.newSource, 'r') : src;
      try {
        while (left > 0) { const r = fs.readSync(from, buf, 0, Math.min(buf.length, left), rpos); if (r <= 0) throw err('Archive ended early.'); fs.writeSync(o, buf, 0, r, wpos); left -= r; rpos += r; wpos += r; }
      } finally { if (from !== src) fs.closeSync(from); }
    }
    if (fs.fstatSync(o).size < pos) fs.ftruncateSync(o, pos);
  } finally { fs.closeSync(src); fs.closeSync(o); }
  if (fs.existsSync(output)) fs.unlinkSync(output);
  fs.renameSync(tmp, output);
}

// ---------------------------------------------------------------- IMG v3
const IMG_MAGIC = 0xA94E2A52;
function imgRead(file, key) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    let head = readAt(fd, 0, 20);
    const enc = head.readUInt32LE(0) !== IMG_MAGIC;
    if (enc) { if (!key) throw err("Couldn't find the archive key in GTAIV.exe."); head = decrypt(head, key); }
    if (head.readUInt32LE(0) !== IMG_MAGIC || head.readInt32LE(4) !== 3) throw err("This isn't a GTA IV .img archive.");
    const count = head.readInt32LE(8), tocSize = head.readInt32LE(12);
    if (count < 0 || tocSize < count * 16 || tocSize > 64 * 1024 * 1024) throw err('The archive looks damaged.');
    let toc = readAt(fd, 20, tocSize);
    if (enc) toc = decrypt(toc, key);
    const names = toc.toString('latin1', count * 16).split('\0');
    const list = [];
    for (let i = 0; i < count; i++) {
      const o = i * 16;
      const first = toc.readUInt32LE(o), type = toc.readInt32LE(o + 4), block = toc.readInt32LE(o + 8), used = toc.readUInt16LE(o + 12), flags = toc.readUInt16LE(o + 14);
      const e = { name: i < names.length ? names[i] : 'file' + i, resource: ((first & 0xC0000000) >>> 0) !== 0, type: type & 0xFF, offset: block * 0x800 };
      e.size = e.resource ? used * 0x800 - (flags & 0x7FF) : first;
      if (e.size < 0 || e.offset + e.size > size) throw err("Couldn't read the archive (wrong key?).");
      list.push(e);
    }
    return list;
  } finally { fs.closeSync(fd); }
}
function imgList(file, key) { return imgRead(file, key).map(e => 'F ' + e.name + ' ' + e.size + (e.resource ? ' rsc' + e.type : '')); }
function imgExtract(file, key, name) {
  for (const e of imgRead(file, key)) {
    if (e.name.toLowerCase() !== String(name).toLowerCase()) continue;
    const fd = fs.openSync(file, 'r'); try { return readAt(fd, e.offset, e.size); } finally { fs.closeSync(fd); }
  }
  return null;
}
function imgReadAll(file, key) {
  const es = imgRead(file, key); const fd = fs.openSync(file, 'r');
  try { return es.map(e => ({ name: e.name, data: readAt(fd, e.offset, e.size) })); } finally { fs.closeSync(fd); }
}
const isRsc = (d) => d.length >= 12 && d[0] === 0x52 && d[1] === 0x53 && d[2] === 0x43 && (d[3] === 5 || d[3] === 0x85);
// writes an unencrypted v3 archive (entries: [{name, data}])
function imgWrite(file, entries) {
  const nameBytes = Buffer.from(entries.map(e => e.name).join('\0') + '\0', 'latin1');
  const table = entries.length * 16 + nameBytes.length;
  const dataStart = Math.ceil((20 + table) / 2048);
  const h = Buffer.alloc(20); h.writeUInt32LE(IMG_MAGIC, 0); h.writeUInt32LE(3, 4); h.writeUInt32LE(entries.length, 8); h.writeUInt32LE(table, 12); h.writeUInt16LE(16, 16); h.writeUInt16LE(0xE9, 18);
  const toc = Buffer.alloc(entries.length * 16);
  let block = dataStart;
  entries.forEach((e, i) => {
    const d = e.data, res = isRsc(d), used = Math.ceil(d.length / 2048), o = i * 16;
    toc.writeUInt32LE(res ? d.readUInt32LE(8) : d.length, o); toc.writeUInt32LE(res ? d.readUInt32LE(4) : 1, o + 4); toc.writeUInt32LE(block, o + 8);
    toc.writeUInt16LE(used & 0xFFFF, o + 12); toc.writeUInt16LE(((used * 2048 - d.length) | (res ? 0x2000 : 0)) & 0xFFFF, o + 14);
    block += used;
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'w');
  try {
    fs.writeSync(fd, h, 0, 20, 0); fs.writeSync(fd, toc, 0, toc.length, 20); fs.writeSync(fd, nameBytes, 0, nameBytes.length, 20 + toc.length);
    let pos = dataStart * 2048;
    for (const e of entries) { fs.writeSync(fd, e.data, 0, e.data.length, pos); pos += Math.ceil(e.data.length / 2048) * 2048; }
    fs.ftruncateSync(fd, pos);
  } finally { fs.closeSync(fd); }
}
// packs loose files into a new .img (the app's mod archives)
function imgPack(sources, outPath) { imgWrite(outPath, sources.map(s => ({ name: path.basename(s), data: fs.readFileSync(s) }))); }
// fixes .img files made by older versions of the app (models missing the resource marker)
function imgRepair(file) {
  let fixed = 0; const fd = fs.openSync(file, 'r+');
  try {
    const size = fs.fstatSync(fd).size; if (size < 20) return 0;
    const h = readAt(fd, 0, 12);
    if (h.readUInt32LE(0) !== IMG_MAGIC || h.readUInt32LE(4) !== 3) return 0;
    const count = h.readUInt32LE(8);
    for (let i = 0; i < count; i++) {
      const at = 20 + i * 16; const t = readAt(fd, at, 16);
      const block = t.readUInt32LE(8), flags = t.readUInt16LE(14);
      if (flags & 0x2000) continue;
      if (block * 2048 + 4 > size) continue;
      const m = readAt(fd, block * 2048, 4);
      if (isRsc(Buffer.concat([m, Buffer.alloc(8)]))) { const b = Buffer.alloc(2); b.writeUInt16LE((flags | 0x2000) & 0xFFFF); fs.writeSync(fd, b, 0, 2, at + 14); fixed++; }
    }
  } finally { fs.closeSync(fd); }
  return fixed;
}

// ---------------------------------------------------------------- WTD (texture dictionary)
const DXT1 = 0x31545844, DXT3 = 0x33545844, DXT5 = 0x35545844, ARGB = 0x15, L8 = 0x32;
const mem = (a, b) => (a << (b + 8)) >>> 0;
function ptr(d, at, nib) { const v = d.readUInt32LE(at); if (v === 0) return -1; if ((v >>> 28) !== nib) throw err('This texture file looks damaged.'); return v & 0x0FFFFFFF; }
const levelW = (t, l) => Math.max(1, t.width >> l), levelH = (t, l) => Math.max(1, t.height >> l);
function levelSize(t, l) {
  const w = levelW(t, l), h = levelH(t, l);
  switch (t.format) {
    case DXT1: return Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * 8;
    case DXT3: case DXT5: return Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * 16;
    case ARGB: return w * h * 4;
    case L8: return w * h;
  }
  throw err('Unknown picture format.');
}
function formatName(f) { return { [DXT1]: 'DXT1', [DXT3]: 'DXT3', [DXT5]: 'DXT5', [ARGB]: 'A8R8G8B8', [L8]: 'L8' }[f] || ('0x' + (f >>> 0).toString(16).toUpperCase()); }

class Wtd {
  static load(file) {
    if (!file || file.length < 16 || file.readUInt32LE(0) !== 0x05435352) throw err("This isn't a GTA IV texture file.");
    if (file.readUInt32LE(4) !== 8) throw err("This file isn't a texture dictionary (.wtd).");
    if (file[12] !== 0x78 || ((file[12] << 8) | file[13]) % 31 !== 0) throw err("This texture file is packed in a way that isn't supported (console version?).");
    const w = new Wtd();
    w.head = Buffer.from(file.subarray(0, 12));
    const flags = file.readUInt32LE(8);
    const sysSize = mem(flags & 0x7FF, (flags >>> 11) & 0xF), gfxSize = mem((flags >>> 15) & 0x7FF, (flags >>> 26) & 0xF);
    let all;
    try { all = zlib.inflateSync(file.subarray(12)); } catch (e) { all = zlib.inflateRawSync(file.subarray(14), { finishFlush: zlib.constants.Z_SYNC_FLUSH }); }
    const full = Buffer.alloc(sysSize + gfxSize); all.copy(full, 0, 0, Math.min(all.length, full.length));
    w.sys = full.subarray(0, sysSize); w.gfx = full.subarray(sysSize);
    w.textures = [];
    const s = w.sys;
    const count = s.readUInt16LE(20), list = ptr(s, 24, 5);
    for (let i = 0; i < count; i++) {
      const ti = ptr(s, list + i * 4, 5);
      const nameAt = ptr(s, ti + 20, 5); let end = nameAt; while (end < s.length && s[end] !== 0) end++;
      let name = s.toString('latin1', nameAt, end);
      if (name.startsWith('pack:/')) name = name.substring(6);
      if (name.toLowerCase().endsWith('.dds')) name = name.substring(0, name.length - 4);
      const t = { name, width: s.readUInt16LE(ti + 28), height: s.readUInt16LE(ti + 30), format: s.readInt32LE(ti + 32), levels: Math.max(1, s[ti + 39]), dataOffset: ptr(s, ti + 72, 6), info: ti };
      let total = 0; for (let l = 0; l < t.levels; l++) total += levelSize(t, l);
      t.dataSize = Math.min(total, w.gfx.length - t.dataOffset);
      w.textures.push(t);
    }
    return w;
  }
  save() {
    const all = Buffer.concat([this.sys, this.gfx]);
    return Buffer.concat([this.head, zlib.deflateSync(all, { level: 9 })]);   // zlib stream: 0x78 0xDA + data + check number
  }
  // B G R A pixels of one texture's biggest level
  pixels(index) { const t = this.textures[index]; return decode(this.gfx, t.dataOffset, t.width, t.height, t.format); }
  // levelPixels(w, h) -> BGRA buffer of that size (the caller resizes the new picture)
  replace(index, levelPixels) {
    const t = this.textures[index];
    let pos = t.dataOffset; const end = t.dataOffset + t.dataSize;
    for (let l = 0; l < t.levels; l++) {
      const w = levelW(t, l), h = levelH(t, l), size = levelSize(t, l);
      if (pos + size > end) break;
      const enc = encode(levelPixels(w, h), w, h, t.format);
      enc.copy(this.gfx, pos, 0, Math.min(size, enc.length));
      pos += size;
    }
    this.changed = true;
  }
  parts() {
    const s = this.sys, r = [];
    const count = s.readUInt16LE(20), hashes = ptr(s, 16, 5), list = ptr(s, 24, 5);
    for (let i = 0; i < count && i < this.textures.length; i++) {
      const t = this.textures[i], ti = ptr(s, list + i * 4, 5);
      const nameAt = ptr(s, ti + 20, 5); let end = nameAt; while (end < s.length && s[end] !== 0) end++;
      const size = Math.max(0, Math.min(t.dataSize, this.gfx.length - t.dataOffset));
      r.push({
        key: t.name.toLowerCase(), info: Buffer.from(s.subarray(ti, ti + 80)), name: Buffer.from(s.subarray(nameAt, end)),
        hash: hashes >= 0 && hashes + i * 4 + 4 <= s.length ? s.readUInt32LE(hashes + i * 4) : nameHash(t.name),
        data: Buffer.from(this.gfx.subarray(t.dataOffset, t.dataOffset + size)), w: t.width, h: t.height, fmt: t.format, levels: t.levels,
      });
    }
    return r;
  }
  build(parts) {
    parts.sort((a, b) => a.hash - b.hash);       // the game looks pictures up by hash
    const n = parts.length, al = (v, a) => Math.ceil(v / a) * a;
    const hashAt = al(this.sys.length, 16), ptrAt = hashAt + n * 4, infoAt = al(ptrAt + n * 4, 16), nameAt = infoAt + n * 80;
    let need = nameAt; for (const p of parts) need += p.name.length + 1;
    const [sysCode, sysSize] = sizeCode(need);
    const ns = Buffer.alloc(sysSize); this.sys.copy(ns, 0);
    const dataAt = []; let g = 0;
    for (let i = 0; i < n; i++) { g = al(g, 256); dataAt.push(g); g += parts[i].data.length; }
    const [gfxCode, gfxSize] = sizeCode(Math.max(g, 256));
    const ng = Buffer.alloc(gfxSize);
    const blockMap = this.sys.readUInt32LE(4);
    let chain = false;
    const oldList = ptr(this.sys, 24, 5);
    if (oldList >= 0 && this.sys.readUInt16LE(20) > 0) { const t0 = ptr(this.sys, oldList, 5); chain = this.sys.readUInt32LE(t0 + 64) !== 0 || this.sys.readUInt32LE(t0 + 68) !== 0; }
    ns.writeUInt32LE((0x50000000 | hashAt) >>> 0, 16); ns.writeUInt16LE(n, 20); ns.writeUInt16LE(n, 22);
    ns.writeUInt32LE((0x50000000 | ptrAt) >>> 0, 24); ns.writeUInt16LE(n, 28); ns.writeUInt16LE(n, 30);
    let nm = nameAt;
    for (let i = 0; i < n; i++) {
      const p = parts[i], at = infoAt + i * 80;
      ns.writeUInt32LE(p.hash >>> 0, hashAt + i * 4);
      ns.writeUInt32LE((0x50000000 | at) >>> 0, ptrAt + i * 4);
      p.info.copy(ns, at);
      ns.writeUInt32LE(blockMap, at + 4);
      ns.writeUInt32LE((0x50000000 | nm) >>> 0, at + 20);
      ns.writeUInt32LE(chain && i > 0 ? (0x50000000 | (at - 80)) >>> 0 : 0, at + 64);
      ns.writeUInt32LE(chain && i < n - 1 ? (0x50000000 | (at + 80)) >>> 0 : 0, at + 68);
      ns.writeUInt32LE((0x60000000 | dataAt[i]) >>> 0, at + 72);
      p.name.copy(ns, nm); nm += p.name.length + 1;
      p.data.copy(ng, dataAt[i]);
    }
    const o = new Wtd();
    o.head = Buffer.from(this.head);
    o.head.writeUInt32LE(((this.head.readUInt32LE(8) & 0xC0000000) | sysCode | (gfxCode << 15)) >>> 0, 8);
    o.sys = ns; o.gfx = ng;
    return o.save();
  }
  // baseFile: the game's own file (or null). mods: each mod's copy, top of My Mods first.
  // Each mod puts in only the pictures it really changed; a lower mod wins a picture only if both changed it.
  static mix(baseFile, mods) {
    const ms = mods.map(m => Wtd.load(m));
    let b = null; if (baseFile) { try { b = Wtd.load(baseFile); } catch (e) { b = null; } }
    if (!b) b = ms[0];
    const baseParts = b.parts(); const orig = new Map(baseParts.map(p => [p.key, p]));
    const result = baseParts.slice(); const at = new Map(result.map((p, i) => [p.key, i]));
    const report = [];
    ms.forEach((m, mi) => {
      let changed = 0;
      for (const p of m.parts()) {
        const o = orig.get(p.key);
        if (o && samePart(o, p)) continue;
        if (at.has(p.key)) result[at.get(p.key)] = p; else { at.set(p.key, result.length); result.push(p); }
        changed++;
      }
      report.push('mod' + (mi + 1) + '=' + changed);
    });
    return { data: b.build(result), report: report.join(' ') };
  }
  static names(file) { return Wtd.load(file).textures.map(t => t.name); }
  // test helper: a small texture file
  static makeTest(names, w, h, fmt, levels) {
    const n = names.length, sysSize = 0x2000;
    const tt = { width: w, height: h, format: fmt, levels }; let per = 0; for (let l = 0; l < levels; l++) per += levelSize(tt, l);
    const gfxNeed = per * n; let gb = 0; while ((0x7FF * 2 ** (gb + 8)) < gfxNeed) gb++;
    const ga = Math.ceil(gfxNeed / 2 ** (gb + 8)), gfxSize = ga * 2 ** (gb + 8);
    const s = Buffer.alloc(sysSize), gf = Buffer.alloc(gfxSize);
    s.writeUInt32LE(n, 20); s.writeUInt32LE(0x50000100, 24);
    for (let i = 0; i < n; i++) {
      const ti = 0x200 + i * 0x80, nm = 0x1000 + i * 0x80;
      s.writeUInt32LE((0x50000000 | ti) >>> 0, 0x100 + i * 4); s.writeUInt32LE((0x50000000 | nm) >>> 0, ti + 20);
      Buffer.from('pack:/' + names[i] + '.dds', 'latin1').copy(s, nm);
      s.writeUInt16LE(w, ti + 28); s.writeUInt16LE(h, ti + 30); s.writeUInt32LE(fmt >>> 0, ti + 32); s[ti + 39] = levels;
      s.writeUInt32LE((0x60000000 | (i * per)) >>> 0, ti + 72);
    }
    const o = new Wtd(); o.head = Buffer.alloc(12);
    o.head.writeUInt32LE(0x05435352, 0); o.head.writeUInt32LE(8, 4); o.head.writeUInt32LE((0xC0000000 | 0x20 | (ga << 15) | (gb << 26)) >>> 0, 8);
    o.sys = s; o.gfx = gf;
    return o.save();
  }
}
function nameHash(str) {   // Jenkins one-at-a-time (only when a file has no hash list)
  let h = 0;
  for (const c of str.toLowerCase()) { h = (h + (c.charCodeAt(0) & 0xFF)) >>> 0; h = (h + (h << 10)) >>> 0; h = (h ^ (h >>> 6)) >>> 0; }
  h = (h + (h << 3)) >>> 0; h = (h ^ (h >>> 11)) >>> 0; h = (h + (h << 15)) >>> 0;
  return h;
}
function samePart(a, b) { return a.w === b.w && a.h === b.h && a.fmt === b.fmt && a.levels === b.levels && a.data.equals(b.data); }
function sizeCode(need) {
  let shift = 0; while (0x7FF * 2 ** (shift + 8) < need) shift++;
  let cnt = Math.ceil(need / 2 ** (shift + 8)); if (cnt === 0) cnt = 1;
  return [(cnt | (shift << 11)) >>> 0, cnt * 2 ** (shift + 8)];
}

// ---- DXT / ARGB / L8 decode -> B G R A
function rgb565(c) { const r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31; return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2), 255]; }
function palette(c0, c1, dxt1) {
  const p0 = rgb565(c0), p1 = rgb565(c1);
  const mix = (wa, wb, d) => [0, 1, 2].map(i => Math.floor((p0[i] * wa + p1[i] * wb) / d)).concat([255]);
  if (c0 > c1 || !dxt1) return [p0, p1, mix(2, 1, 3), mix(1, 2, 3)];
  return [p0, p1, mix(1, 1, 2), [0, 0, 0, 0]];
}
function decodeAlpha(d, b) {
  const a0 = d[b], a1 = d[b + 1], a = [a0, a1];
  if (a0 > a1) for (let i = 1; i < 7; i++) a.push(Math.floor(((7 - i) * a0 + i * a1) / 7));
  else { for (let i = 1; i < 5; i++) a.push(Math.floor(((5 - i) * a0 + i * a1) / 5)); a.push(0, 255); }
  let bits = 0n; for (let i = 0; i < 6; i++) bits |= BigInt(d[b + 2 + i]) << BigInt(8 * i);
  const out = []; for (let i = 0; i < 16; i++) out.push(a[Number((bits >> BigInt(3 * i)) & 7n)]);
  return out;
}
function decode(gfx, o, w, h, fmt) {
  const px = Buffer.alloc(w * h * 4);
  if (fmt === ARGB) { gfx.copy(px, 0, o, Math.min(o + px.length, gfx.length)); return px; }
  if (fmt === L8) { for (let i = 0; i < w * h && o + i < gfx.length; i++) { px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = gfx[o + i]; px[i * 4 + 3] = 255; } return px; }
  const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2), bs = fmt === DXT1 ? 8 : 16;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const b = o + (by * bw + bx) * bs; if (b + bs > gfx.length) continue;
    let c = b, al = null;
    if (fmt === DXT3) { al = []; for (let i = 0; i < 16; i++) al.push(((gfx[b + (i >> 1)] >> ((i & 1) * 4)) & 0xF) * 17); c = b + 8; }
    else if (fmt === DXT5) { al = decodeAlpha(gfx, b); c = b + 8; }
    const pal = palette(gfx.readUInt16LE(c), gfx.readUInt16LE(c + 2), fmt === DXT1);
    const idx = gfx.readUInt32LE(c + 4);
    for (let i = 0; i < 16; i++) {
      const x = bx * 4 + (i & 3), y = by * 4 + (i >> 2); if (x >= w || y >= h) continue;
      const col = pal[(idx >>> (i * 2)) & 3], p = (y * w + x) * 4;
      px[p] = col[2]; px[p + 1] = col[1]; px[p + 2] = col[0]; px[p + 3] = fmt === DXT1 ? col[3] : al[i];
    }
  }
  return px;
}
// ---- encode B G R A -> format
const clamp = (v) => Math.min(255, Math.max(0, v | 0));
const to565 = (r, g, b) => ((clamp(r) >> 3) << 11) | ((clamp(g) >> 2) << 5) | (clamp(b) >> 3);
function encode(px, w, h, fmt) {
  if (fmt === ARGB) return Buffer.from(px);
  if (fmt === L8) { const o = Buffer.alloc(w * h); for (let i = 0; i < o.length; i++) o[i] = Math.floor((px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3); return o; }
  const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2), bs = fmt === DXT1 ? 8 : 16;
  const out = Buffer.alloc(bw * bh * bs);
  const r = new Array(16), g = new Array(16), b = new Array(16), a = new Array(16);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    for (let i = 0; i < 16; i++) {
      const x = Math.min(w - 1, bx * 4 + (i & 3)), y = Math.min(h - 1, by * 4 + (i >> 2)), p = (y * w + x) * 4;
      b[i] = px[p]; g[i] = px[p + 1]; r[i] = px[p + 2]; a[i] = px[p + 3];
    }
    const o = (by * bw + bx) * bs; let c = o;
    if (fmt === DXT3) { for (let i = 0; i < 16; i += 2) out[o + (i >> 1)] = Math.floor((a[i] * 15 + 127) / 255) | (Math.floor((a[i + 1] * 15 + 127) / 255) << 4); c = o + 8; }
    else if (fmt === DXT5) { encodeAlpha(a, out, o); c = o + 8; }
    encodeColor(r, g, b, a, fmt === DXT1, out, c);
  }
  return out;
}
function encodeColor(r, g, b, a, dxt1, o, at) {
  let holes = false; if (dxt1) for (let i = 0; i < 16; i++) if (a[i] < 128) holes = true;
  let mr = 0, mg = 0, mb = 0, n = 0;
  for (let i = 0; i < 16; i++) { if (holes && a[i] < 128) continue; mr += r[i]; mg += g[i]; mb += b[i]; n++; }
  if (n === 0) { o.writeUInt32LE(0, at); o.writeUInt32LE(0xFFFFFFFF, at + 4); return; }
  mr = Math.floor(mr / n); mg = Math.floor(mg / n); mb = Math.floor(mb / n);
  let cr = 0, cg = 0, cb = 0;
  for (let i = 0; i < 16; i++) { if (holes && a[i] < 128) continue; const dr = r[i] - mr, dg = g[i] - mg, db = b[i] - mb, s = (dr + dg + db) >= 0 ? 1 : -1; cr += dr * s; cg += dg * s; cb += db * s; }
  if (cr === 0 && cg === 0 && cb === 0) cr = cg = cb = 1;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 16; i++) { if (holes && a[i] < 128) continue; const d = (r[i] - mr) * cr + (g[i] - mg) * cg + (b[i] - mb) * cb; if (d < lo) lo = d; if (d > hi) hi = d; }
  const len = cr * cr + cg * cg + cb * cb, inset = (hi - lo) / 16; lo += inset; hi -= inset;
  let c0 = to565(mr + cr * hi / len, mg + cg * hi / len, mb + cb * hi / len);
  let c1 = to565(mr + cr * lo / len, mg + cg * lo / len, mb + cb * lo / len);
  if (holes) { if (c0 > c1) [c0, c1] = [c1, c0]; }
  else { if (c0 < c1) [c0, c1] = [c1, c0]; if (c0 === c1) { if (c1 > 0) c1--; else c0++; } }
  const pal = palette(c0, c1, dxt1);
  let idx = 0;
  for (let i = 0; i < 16; i++) {
    let best = 0;
    if (holes && a[i] < 128) best = 3;
    else {
      let bd = Infinity;
      for (let k = 0; k < (holes ? 3 : 4); k++) { const dr = pal[k][0] - r[i], dg = pal[k][1] - g[i], db = pal[k][2] - b[i]; const dd = dr * dr * 3 + dg * dg * 4 + db * db * 2; if (dd < bd) { bd = dd; best = k; } }
    }
    idx = (idx | (best << (i * 2))) >>> 0;
  }
  o.writeUInt16LE(c0, at); o.writeUInt16LE(c1, at + 2); o.writeUInt32LE(idx >>> 0, at + 4);
}
function encodeAlpha(a, o, at) {
  let lo = 255, hi = 0; for (let i = 0; i < 16; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
  o[at] = hi; o[at + 1] = lo;
  const pal = [hi, lo]; for (let i = 1; i < 7; i++) pal.push(Math.floor(((7 - i) * hi + i * lo) / 7));
  let bits = 0n;
  for (let i = 0; i < 16; i++) {
    let best = 0, bd = Infinity;
    if (hi !== lo) for (let k = 0; k < 8; k++) { const d = Math.abs(pal[k] - a[i]); if (d < bd) { bd = d; best = k; } }
    bits |= BigInt(best) << BigInt(3 * i);
  }
  for (let i = 0; i < 6; i++) o[at + 2 + i] = Number((bits >> BigInt(8 * i)) & 0xFFn);
}

// ---------------------------------------------------------------- ZIP (reading; stored + deflate, zip64 sizes)
function zipEntries(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tail = readAt(fd, Math.max(0, size - 66000), Math.min(size, 66000));
    let eocd = -1; for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw err("This .zip file looks damaged.");
    let count = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16);
    if (cdOff === 0xFFFFFFFF || count === 0xFFFF) {
      const base = Math.max(0, size - 66000) + eocd;
      const loc = readAt(fd, base - 20, 20);
      if (loc.readUInt32LE(0) === 0x07064b50) {
        const z64 = readAt(fd, Number(loc.readBigUInt64LE(8)), 56);
        count = Number(z64.readBigUInt64LE(32)); cdSize = Number(z64.readBigUInt64LE(40)); cdOff = Number(z64.readBigUInt64LE(48));
      }
    }
    const cd = readAt(fd, cdOff, cdSize); const out = []; let p = 0;
    for (let i = 0; i < count; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10);
      let csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
      const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
      let off = cd.readUInt32LE(p + 42);
      const nameRaw = cd.subarray(p + 46, p + 46 + nl);
      const name = (flags & 0x800) ? nameRaw.toString('utf8') : decodeCp437(nameRaw);
      let x = p + 46 + nl; const xe = x + xl;
      while (x + 4 <= xe) {
        const id = cd.readUInt16LE(x), sz = cd.readUInt16LE(x + 2); let q = x + 4;
        if (id === 1) {
          if (usize === 0xFFFFFFFF) { usize = Number(cd.readBigUInt64LE(q)); q += 8; }
          if (csize === 0xFFFFFFFF) { csize = Number(cd.readBigUInt64LE(q)); q += 8; }
          if (off === 0xFFFFFFFF) { off = Number(cd.readBigUInt64LE(q)); q += 8; }
        }
        x += 4 + sz;
      }
      out.push({ name, method, csize, usize, off, encrypted: !!(flags & 1), dir: name.endsWith('/') });
      p += 46 + nl + xl + cl;
    }
    return out;
  } finally { fs.closeSync(fd); }
}
function decodeCp437(b) { let s = ''; for (const c of b) s += c < 128 ? String.fromCharCode(c) : String.fromCharCode(c); return s; }
function zipRead(file, e, fd0) {
  const fd = fd0 || fs.openSync(file, 'r');
  try {
    const lh = readAt(fd, e.off, 30);
    const start = e.off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    const data = readAt(fd, start, e.csize);
    if (e.method === 0) return data;
    if (e.method === 8) return zlib.inflateRawSync(data);
    throw err('This .zip uses a packing method that isn\'t supported. Install 7-Zip (free) and try again.');
  } finally { if (!fd0) fs.closeSync(fd); }
}
function extractZip(file, dest) {
  const es = zipEntries(file); const fd = fs.openSync(file, 'r');
  const root = path.resolve(dest);
  try {
    for (const e of es) {
      if (e.encrypted) throw err('This .zip has a password. Extract it yourself first and choose the folder.');
      const rel = e.name.replace(/\\/g, '/').split('/').filter(s => s && s !== '.' && s !== '..').join(path.sep);
      if (!rel) continue;
      const out = path.join(root, rel);
      if (!out.startsWith(root)) continue;
      if (e.dir) { fs.mkdirSync(out, { recursive: true }); continue; }
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, zipRead(file, e, fd));
    }
  } finally { fs.closeSync(fd); }
}
// a small zip writer (stored + deflate) for mod list sharing and similar
function writeZip(file, entries) {
  const parts = [], cds = []; let off = 0;
  const crc32 = zlib.crc32 || crcFallback;
  for (const e of entries) {
    const name = Buffer.from(e.name.replace(/\\/g, '/'), 'utf8');
    const data = Buffer.from(e.data); const comp = zlib.deflateRawSync(data); const crc = crc32(data) >>> 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    parts.push(lh, name, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    cds.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(cds);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  fs.writeFileSync(file, Buffer.concat([...parts, cd, end]));
}
let crcTable = null;
function crcFallback(buf) {
  if (!crcTable) { crcTable = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; } }
  let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0;
}

module.exports = {
  keyState, findKey, decrypt, encrypt,
  rpf: { load: rpfLoad, list: rpfList, extract: rpfExtract, build: rpfBuild },
  img: { read: imgRead, list: imgList, extract: imgExtract, readAll: imgReadAll, write: imgWrite, pack: imgPack, repair: imgRepair },
  Wtd, DXT1, DXT3, DXT5, ARGB, L8, levelSize, formatName, decode, encode,
  zip: { entries: zipEntries, extract: extractZip, write: writeZip },
};
