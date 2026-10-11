// The game only sees update\<game path>: files the app keeps in a mod's own update folder,
// and the archives it builds, must also be at update\<game path>.
//   node test/t_root.cjs
const fs = require('fs'), path = require('path'), assert = require('assert');
const C = require('../electron/engine/core.cjs'), P = require('../electron/engine/plan.cjs'), F = require('../electron/engine/formats.cjs');
const G = path.join(__dirname, 'game_root'), M = path.join(__dirname, 'mods_root');
require('./fixture.cjs')(G, M);
C.E.host.status = () => {}; C.E.host.ask = async (m, t, b) => b[0]; C.E.host.trash = () => {};
C.setGame(G);
const at = (r) => path.join(G, r.replace(/\\/g, '/'));
(async () => {
  try {
    // a texture mod with its own update folder
    let plan = P.loadMod(path.join(M, 'Neon HUD.zip'));
    const hudRow = plan.rows.find(r => /hud\.wtd$/i.test(r.Source)); console.log('neon hud ->', hudRow.Dest);
    await P.installPlan(plan);
    assert.ok(fs.existsSync(at('update\\pc\\textures\\hud.wtd')), 'hud.wtd is where the game looks');
    // Niko's clothes go into a modded playerped.rpf - it must be where the game looks too
    plan = P.loadMod(path.join(M, 'Niko Red Jacket.zip'));
    await P.installPlan(plan);
    const root = at('update\\pc\\models\\cdimages\\playerped.rpf');
    assert.ok(fs.existsSync(root), 'playerped.rpf is where the game looks');
    const built = at(C.ARCHIVE_DIR + '\\pc\\models\\cdimages\\playerped.rpf');
    assert.strictEqual(fs.statSync(root).size, fs.statSync(built).size);
    const inner = F.rpf.list(root, C.archiveKey()).join('\n'); assert.match(inner, /uppr_000_u\.wtd/);
    console.log('links:', JSON.stringify(C.loadRootLinks()).slice(0, 200));
    // turning a mod off takes its copy away again
    P.disableMod('Neon HUD');
    assert.ok(!fs.existsSync(at('update\\pc\\textures\\hud.wtd')) || !C.loadRootLinks()['update\\pc\\textures\\hud.wtd'], 'off -> copy gone');
    P.uninstallMod('Niko Red Jacket');
    assert.ok(!fs.existsSync(root), 'uninstalled -> playerped copy gone');
    // the game's own files are untouched
    assert.ok(fs.existsSync(at('pc\\models\\cdimages\\playerped.rpf')) && fs.existsSync(at('pc\\textures\\hud.wtd')));
    console.log('ROOT TEST OK');
  } catch (e) { console.log('ROOT TEST FAILED', e.stack); process.exitCode = 1; }
})();
