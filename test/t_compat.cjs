// data written by the old PowerShell version: BOM, single values instead of lists, no Enabled field
const fs = require('fs'), path = require('path');
const W = require('../electron/engine/worker.cjs').API;
const C = require('../electron/engine/core.cjs');
const G = path.join(__dirname, 'compat'); fs.rmSync(G, { recursive: true, force: true });
const w = (p, d) => { p = path.join(G, p.replace(/\\/g, '/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, d); };
w('GTAIV.exe', 'x');
w('LCModInstaller\\library\\Lola\\update\\Lola\\pc\\models\\cdimages\\lola.img', 'IMG');
w('LCModInstaller\\library\\Lola\\update\\common\\data\\lola.ide', 'peds\nlola, lola\nend\n');
w('LCModInstaller\\library\\My Script\\scripts\\MyScript.net.dll', 'MZ');
w('update\\Lola\\pc\\models\\cdimages\\lola.img', 'IMG');   // already in the game (deployed by the old version)
const BOM = '﻿';
fs.writeFileSync(path.join(G, 'LCModInstaller/mods.json'), BOM + JSON.stringify([
  { Name: 'Lola', Date: '2026-09-29 21:02', Files: ['update\\Lola\\pc\\models\\cdimages\\lola.img', 'update\\common\\data\\lola.ide'], Backups: [], Enabled: true, Archives: [], Library: true, Source: { Site: 'Nexus', NexusId: '1350', Version: '1.0', Url: 'https://www.nexusmods.com/gta4/mods/1350' } },
  { Name: 'My Script', Date: '2026-09-30 10:00', Files: 'scripts\\MyScript.net.dll', Backups: [], Library: true },
], null, 4));
fs.writeFileSync(path.join(G, 'LCModInstaller/deployed.json'), BOM + '{\n    "update\\\\lola\\\\pc\\\\models\\\\cdimages\\\\lola.img":  "Lola"\n}');
fs.writeFileSync(path.join(G, 'LCModInstaller/settings.json'), BOM + '{ "NexusKey": "01000000d08c9ddf0115d1118c7a00c04fc297eb", "WatchDownloads": true, "OldNxm": "" }');
(async () => {
  console.log('open:', JSON.stringify(W.openGame(G)));
  const mods = W.myMods(); console.log(mods.map(m => m.name + ' on=' + m.on + ' files=' + m.files + ' missing=' + m.missing + ' ver=' + m.version).join(' | '));
  console.log('game files:', ['update/Lola/pc/models/cdimages/lola.img', 'update/common/data/lola.ide', 'scripts/MyScript.net.dll'].map(f => f + '=' + fs.existsSync(path.join(G, f))).join(', '));
  C.E.host.secret = async () => null;
  console.log('nexus account (old key):', JSON.stringify(await W.nexusAccount()));
  await W.setModOn('Lola', false); console.log('Lola off ->', fs.existsSync(path.join(G, 'update/Lola/pc/models/cdimages/lola.img')), fs.existsSync(path.join(G, 'update/common/data/lola.ide')));
  await W.setModOn('Lola', true); console.log('Lola on  ->', fs.existsSync(path.join(G, 'update/Lola/pc/models/cdimages/lola.img')), fs.existsSync(path.join(G, 'update/common/data/lola.ide')));
  fs.rmSync(G, { recursive: true, force: true });
})();
