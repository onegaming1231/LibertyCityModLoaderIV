// builds a fake GTA IV folder and some mods for testing
const fs = require('fs'), path = require('path');
const F = require('../electron/engine/formats.cjs');
module.exports = function make(G, M) {
  fs.rmSync(G, { recursive: true, force: true }); fs.rmSync(M, { recursive: true, force: true });
  const w = (p, d) => { p = path.join(G, p.replace(/\\/g, '/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, d); };
  const mw = (p, d) => { p = path.join(M, p.replace(/\\/g, '/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, d); };
  // GTAIV.exe with version 1.2.0.59 (VS_FIXEDFILEINFO)
  const exe = Buffer.alloc(256); Buffer.from([0xBD, 0x04, 0xEF, 0xFE]).copy(exe, 64); exe.writeUInt32LE((1 << 16) | 2, 72); exe.writeUInt32LE((0 << 16) | 59, 76);
  w('GTAIV.exe', exe);
  const pv = Buffer.concat([Buffer.alloc(16), Buffer.from('ProductVersion\0', 'utf16le'), Buffer.from('3.0.0\0', 'utf16le')]);
  w('plugins\\GTAIV.EFLC.FusionFix.asi', pv); w('plugins\\GTAIV.EFLC.FusionFix.ini', '[MISC]\nVehicleBudget = 0 ; traffic\n'); w('dinput8.dll', 'x');
  w('common\\data\\handling.dat', 'ADMIRAL 1500.0 2.0 80 0.0 0.0 -0.1 0.0 5 0.85 0.75 140.0\n%BOAT 1500.0 2.0 80 0.0 0.0 -0.1 0.0 5 0.85 0.75 140.0\n');
  w('common\\data\\vehicles.ide', 'cars\nadmiral, admiral, car, ADMIRAL, ADMIRAL, VEH@STD, NULL, 10, 1\nend\n');
  w('common\\data\\carcols.dat', 'col\n0,0,0\nend\ncar4\nadmiral, 1,1,1,1\nend\n');
  w('common\\data\\cargrp.dat', 'admiral, # POPCYCLE_GROUP_ONLY_IN_NATIVE_ZONE\nadmiral, # POPCYCLE_GROUP_AIRPORT_WORKERS\n');
  w('common\\data\\gta.dat', 'IDE common:/data/vehicles.ide\nIMG pc:/models/cdimages/vehicles.img\n');
  w('common\\data\\images.txt', 'pc:/models/cdimages/vehicles\n'); w('common\\data\\default.dat', 'IDE common:/data/default.ide\n');
  const Mk = (names, wd, vals) => { const o = F.Wtd.load(F.Wtd.makeTest(names, wd, wd, F.DXT1, 1)); names.forEach((n, i) => { const t = o.textures[i]; o.gfx.fill(vals[i], t.dataOffset, t.dataOffset + t.dataSize); }); return o.save(); };
  // colorful test pictures: fill DXT1 blocks with a color (c0 = c1 = color)
  const Pic = (names, wd, cols) => { const o = F.Wtd.load(F.Wtd.makeTest(names, wd, wd, F.DXT1, 1)); names.forEach((n, i) => { const t = o.textures[i]; for (let b = t.dataOffset; b < t.dataOffset + t.dataSize; b += 8) { o.gfx.writeUInt16LE(cols[i], b); o.gfx.writeUInt16LE(cols[i], b + 2); o.gfx.writeUInt32LE(0, b + 4); } }); return o.save(); };
  w('pc\\textures\\hud.wtd', Pic(['radar', 'weapon', 'font'], 64, [0x001F, 0x07E0, 0xF800]));
  F.img.write(path.join(G, 'pc/models/cdimages/vehicles.img'), [{ name: 'admiral.wft', data: Buffer.from('RSC\x05' + 'x'.repeat(60)) }, { name: 'blips.wtd', data: Pic(['cop', 'star'], 32, [0xFFE0, 0x8410]) }]);
  // playerped.rpf (table not encrypted)
  const names = ['', 'uppr_000_u.wtd', 'head_000_r.wdd'];
  let nb = Buffer.alloc(0); const off = []; for (const n of names) { off.push(nb.length); nb = Buffer.concat([nb, Buffer.from(n + '\0')]); }
  const wt = Mk(['uppr_diff_000_a_uni'], 16, [5]);
  const toc = Buffer.alloc(3 * 16); toc.writeInt32LE(off[0], 0); toc.writeUInt32LE(0x80000001, 8); toc.writeInt32LE(2, 12);
  toc.writeInt32LE(off[1], 16); toc.writeInt32LE(wt.length, 20); toc.writeInt32LE(0x1000 | 8, 24); toc.writeUInt32LE((wt.readUInt32LE(8) | 0xC0000000) >>> 0, 28);
  toc.writeInt32LE(off[2], 32); toc.writeInt32LE(5, 36); toc.writeInt32LE(0x1800, 40); toc.writeUInt32LE(5, 44);
  const t = Buffer.concat([toc, nb]); const rpf = Buffer.alloc(0x2000);
  rpf.writeInt32LE(0x32465052, 0); rpf.writeInt32LE(t.length, 4); rpf.writeInt32LE(3, 8); rpf.writeInt32LE(0, 12); rpf.writeInt32LE(0, 16);
  t.copy(rpf, 0x800); wt.copy(rpf, 0x1000); Buffer.from('hello').copy(rpf, 0x1800);
  w('pc\\models\\cdimages\\playerped.rpf', rpf);
  // mods put in by hand (to be found)
  w('scripts\\SuperTrainer.net.dll', 'MZ SuperTrainer reads SuperTrainer.ini'); w('scripts\\SuperTrainer.ini', '[keys]\nopen=F5\n');
  w('update\\Old HUD\\pc\\textures\\hud.wtd', Mk(['radar'], 8, [77]));
  w("Liberty's Legacy\\Lists\\addon_vehicle_models.txt", ''); w('ScriptHookDotNet.asi', 'x');
  w('GTAIV.log', 'log'); w('enbseries.ini', '[x]');
  // mods to install
  for (const f of ['coach.wft', 'coach.wtd', 'data.txt']) mw('Coach Bus\\' + f, fs.readFileSync('/mnt/user-data/uploads/' + f));
  mw('Coach Bus\\readme.txt', 'Coach bus for GTA IV.\n');
  F.zip.write(path.join(M, 'Neon HUD.zip'), [{ name: 'Neon HUD/update/pc/textures/hud.wtd', data: Pic(['radar', 'weapon', 'font'], 64, [0xF81F, 0x07E0, 0xF800]) }, { name: 'Neon HUD/readme.txt', data: Buffer.from('Neon radar') }]);
  F.zip.write(path.join(M, 'Gold Weapons HUD.zip'), [{ name: 'pc/textures/hud.wtd', data: Pic(['radar', 'weapon', 'font'], 64, [0x001F, 0xFEA0, 0xF800]) }]);
  // a 40x40 red/blue png for "Replace Picture"
  const zlib = require('zlib'); const W = 40, H = 40; const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = y * (W * 4 + 1) + 1 + x * 4; raw[o] = x < 20 ? 255 : 0; raw[o + 2] = x < 20 ? 0 : 255; raw[o + 3] = 255; }
  const crc = (b) => { let c = -1; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6;
  fs.writeFileSync(path.join(M, 'new-star.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  F.zip.write(path.join(M, 'Niko Red Jacket.zip'), [{ name: 'uppr_000_u.wtd', data: Mk(['uppr_diff_000_a_uni'], 16, [99]) }]);
};
if (require.main === module) { module.exports(process.argv[2], process.argv[3]); console.log('made'); }
