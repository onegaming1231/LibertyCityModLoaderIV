// Smart file reader test: files with no folder path (and odd names) still get the right place
//   node test/t_sniff.cjs
const fs = require('fs'), path = require('path'), assert = require('assert');
const C = require('../electron/engine/core.cjs'), P = require('../electron/engine/plan.cjs'), F = require('../electron/engine/formats.cjs');
const G = path.join(__dirname, 'game_sniff'); fs.rmSync(G, { recursive: true, force: true });
const w = (root, p, d) => { p = path.join(root, p.replace(/\\/g, '/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, d); };
C.E.host.status = () => {};
const wtd = (names) => F.Wtd.load(F.Wtd.makeTest(names, 8, 8, F.DXT1, 1)).save();

// a tiny Windows program file: dotnet = has the .NET part, x64 = 64-bit, text = words inside it
function pe({ dotnet = false, x64 = false, text = '' }) {
  const b = Buffer.alloc(0x400); b.write('MZ', 0, 'latin1'); b.writeUInt32LE(0x80, 0x3C);
  b.write('PE\0\0', 0x80, 'latin1'); const opt = 0x80 + 0x18; b.writeUInt16LE(x64 ? 0x20B : 0x10B, opt);
  const dirs = opt + (x64 ? 0x70 : 0x60); if (dotnet) { b.writeUInt32LE(0x2008, dirs + 14 * 8); b.writeUInt32LE(0x48, dirs + 14 * 8 + 4); }
  b.write(text, 0x200, 'latin1'); return b;
}

w(G, 'GTAIV.exe', 'x'); w(G, 'plugins\\GTAIV.EFLC.FusionFix.asi', 'x'); w(G, 'ScriptHookDotNet.asi', 'x');
w(G, 'pc\\textures\\blips.wtd', wtd(['radar_police', 'radar_safehouse', 'radar_bar', 'radar_taxi']));
w(G, 'pc\\textures\\hud.wtd', wtd(['radar_ring', 'health_bar', 'armour_bar']));
w(G, 'tlad\\pc\\textures\\blips.wtd', wtd(['radar_police', 'radar_safehouse']));
w(G, 'pc\\data\\hud.dat', 'HUD 1\n');
w(G, 'common\\data\\weaponinfo.xml', '<?xml version="1.0"?>\n<weaponinfo>\n <weapon type="PISTOL"/>\n</weaponinfo>\n');
C.setGame(G);

const M = path.join(__dirname, 'sniffmod'); fs.rmSync(M, { recursive: true, force: true });
w(M, 'My V Blips.wtd', wtd(['radar_police', 'radar_safehouse', 'radar_bar']));   // odd name, game's blip pictures inside
w(M, 'hud.dat', 'HUD 2\n');                                                         // same name as a game file
w(M, 'banshee.wtd', F.Wtd.makeTest(['x'], 8, 8, F.DXT1, 1).subarray(0, 12).length ? (() => { const b = Buffer.from(wtd(['x'])); b.writeUInt32LE(112, 4); return b; })() : null); // really a .wft
w(M, 'CoolScript.dll', pe({ dotnet: true, text: 'ScriptHookDotNet GTA.Script' }));
w(M, 'Thing.dll', pe({ dotnet: true, text: 'IVSDKDotNetWrapper IVSDKDotNet' }));
w(M, 'OldHud.asi', pe({ text: 'D:\\Stuff\\Projects\\GTAIV_SDK\\projects\\VHud\\data\\OldHud.pdb' }));
w(M, 'Big64.asi', pe({ x64: true }));
w(M, 'Normal.asi', pe({ text: 'C:\\src\\normal\\Release\\Normal.pdb' }));
w(M, 'better_guns.xml', '<?xml version="1.0"?>\n<!-- my guns -->\n<weaponinfo>\n <weapon type="PISTOL"/>\n</weaponinfo>\n');
w(M, 'newmap.ide', 'objs\nmy_rock, my_rock, 100, 0\nend\ntobj\nend\n');

const plan = P.loadMod(M);
const by = {}; for (const r of plan.rows) { by[path.basename(r.Source)] = r; console.log(' ', r.Kind.padEnd(11), path.basename(r.Source).padEnd(16), '->', (r.Dest || '-').padEnd(42), '|', r.Note); }
console.log('warning:', plan.warning);
try {
  assert.match(by['My V Blips.wtd'].Dest, /pc\\textures\\blips\.wtd$/); assert.ok(!/tlad/i.test(by['My V Blips.wtd'].Dest));
  assert.match(by['hud.dat'].Dest, /pc\\data\\hud\.dat$/);
  assert.strictEqual(by['banshee.wtd'].Kind, 'MANUAL'); assert.match(by['banshee.wtd'].Note, /\.wft/);
  assert.strictEqual(by['CoolScript.dll'].Dest, 'scripts\\CoolScript.net.dll'); assert.strictEqual(by['CoolScript.dll'].Kind, 'SCRIPT');
  assert.strictEqual(by['Thing.dll'].Dest, 'IVSDKDotNet\\scripts\\Thing.ivsdk.dll');
  assert.strictEqual(by['OldHud.asi'].Kind, 'MANUAL'); assert.match(plan.warning, /OldHud\.asi/);
  assert.strictEqual(by['Big64.asi'].Kind, 'MANUAL'); assert.match(by['Big64.asi'].Note, /64-bit/);
  assert.strictEqual(by['Normal.asi'].Dest, 'Normal.asi');
  assert.match(by['better_guns.xml'].Dest, /common\\data\\weaponinfo\.xml$/);
  assert.strictEqual(by['newmap.ide'].Kind, 'MANUAL'); assert.match(by['newmap.ide'].Note, /map data/i);
  console.log('SNIFF TEST OK');
} catch (e) { console.log('SNIFF TEST FAILED', e.message); process.exitCode = 1; }

// settings .txt files that belong to a script or plugin are installed, readmes are not
const M2 = path.join(__dirname, 'txtmod'); fs.rmSync(M2, { recursive: true, force: true });
w(M2, 'Trainer Mod\\readme.txt', 'Put the files in scripts');
w(M2, 'Trainer Mod\\scripts\\Trainer.net.dll', pe({ dotnet: true, text: 'ScriptHookDotNet' }));
w(M2, 'Trainer Mod\\scripts\\Trainer\\cars.txt', 'admiral\nbanshee\n');
w(M2, 'Trainer Mod\\scripts\\Trainer\\Credits.txt', 'thanks');
w(M2, 'Plugin Mod\\Plugin.asi', pe({}));
w(M2, 'Plugin Mod\\Plugin.cfg', 'a=1');
w(M2, 'Plugin Mod\\spawnlist.txt', 'x');
const plan2 = P.loadMod(M2);
const by2 = {}; for (const r of plan2.rows) { by2[path.basename(r.Source)] = r; console.log(' ', r.Kind.padEnd(11), path.basename(r.Source).padEnd(16), '->', (r.Dest || '-').padEnd(42), '|', r.Note); }
try {
  assert.strictEqual(by2['readme.txt'].Kind, 'SKIP');
  assert.strictEqual(by2['Credits.txt'].Kind, 'SKIP');
  assert.strictEqual(by2['cars.txt'].Dest, 'scripts\\Trainer\\cars.txt');
  assert.ok(by2['spawnlist.txt'].Dest, 'spawnlist.txt next to the plugin is installed');
  console.log('TXT TEST OK');
} catch (e) { console.log('TXT TEST FAILED', e.message); process.exitCode = 1; }

// a download with only a readme and a link: the app says so and shows the readme
const M3 = path.join(__dirname, 'emptymod'); fs.rmSync(M3, { recursive: true, force: true });
w(M3, 'Readme.txt', 'Clothing Combination Script\nCopy ClothesChange.net.dll to scripts.\n');
w(M3, 'LibertyCity.Ru.url', '[InternetShortcut]\nURL=https://libertycity.ru/\n');
const plan3 = P.loadMod(M3);
// a download with the real mod zipped inside it
const M4 = path.join(__dirname, 'nestedmod'); fs.rmSync(M4, { recursive: true, force: true }); fs.mkdirSync(M4, { recursive: true });
F.zip.write(path.join(M4, 'inner.zip'), [{ name: 'scripts/Inner.net.dll', data: pe({ dotnet: true, text: 'ScriptHookDotNet' }) }]);
fs.writeFileSync(path.join(M4, 'readme.txt'), 'hi');
const plan4 = P.loadMod(M4);
try {
  assert.match(plan3.warning, /nothing to install/i); assert.match(plan3.readme, /Copy ClothesChange/);
  assert.match(plan3.rows.find(r => /\.url$/.test(r.Source)).Note, /libertycity\.ru/);
  assert.ok(plan4.rows.some(r => r.Dest === 'scripts\\Inner.net.dll'), 'zip inside the download is unpacked');
  console.log('EMPTY/NESTED TEST OK');
} catch (e) { console.log('EMPTY/NESTED TEST FAILED', e.message); process.exitCode = 1; }

// an OpenIV package (.oiv) inside the download, with its instructions saved as UTF-16
const M5 = path.join(__dirname, 'oivmod'); fs.rmSync(M5, { recursive: true, force: true }); fs.mkdirSync(M5, { recursive: true });
const asm16 = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('<?xml version="1.0" encoding="utf-16"?>\n<package version="2.1" id="{x}" target="Four">\n<content>\n<add source="ClothesChange.net.dll">scripts/ClothesChange.net.dll</add>\n<add source="ClothesChange.ini">scripts/ClothesChange.ini</add>\n</content>\n</package>\n', 'utf16le')]);
F.zip.write(path.join(M5, 'Clothes combination script.oiv'), [
  { name: 'assembly.xml', data: asm16 },
  { name: 'content/ClothesChange.net.dll', data: pe({ dotnet: true, text: 'ScriptHookDotNet' }) },
  { name: 'content/ClothesChange.ini', data: Buffer.from('[a]\nb=1\n') },
  { name: 'content/scripts/Clothes Combination files/clothesC_punk.ini', data: Buffer.from('name=punk\n') },
]);
fs.writeFileSync(path.join(M5, 'Readme.txt'), 'read me');
const plan5 = P.loadMod(M5);
for (const r of plan5.rows) console.log(' ', r.Kind.padEnd(11), path.basename(r.Source).padEnd(26), '->', (r.Dest || '-').padEnd(48), '|', r.Note);
try {
  assert.ok(plan5.rows.some(r => r.Dest === 'scripts\\ClothesChange.net.dll'));
  assert.ok(plan5.rows.some(r => r.Dest === 'scripts\\ClothesChange.ini'));
  assert.ok(plan5.rows.some(r => /clothesC_punk\.ini$/.test(r.Dest)), 'file the instructions missed still gets placed');
  console.log('OIV TEST OK');
} catch (e) { console.log('OIV TEST FAILED', e.message); process.exitCode = 1; }
