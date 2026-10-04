// drives the real app window: clicks through it and takes screenshots
const fs = require('fs'), path = require('path');
const OUT = process.env.LCML_SHOTS, M = process.env.LCML_MODS, G = process.env.LCML_GAME;
module.exports = async function (win, { callEngine }) {
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(code, true);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const log = (...a) => console.log('[e2e]', ...a);
  let n = 0;
  const shot = async (name) => { await sleep(700); const img = await wc.capturePage(); fs.writeFileSync(path.join(OUT, String(++n).padStart(2, '0') + '-' + name + '.png'), img.toPNG()); log('shot', name); };
  const waitFor = async (cond, ms = 20000, what = cond) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await js(cond)) return true; } catch (e) { /* */ } await sleep(250); } log('TIMEOUT waiting for', what); return false; };
  const click = async (text, exact = true) => {
    const ok = await js(`(() => { const t = ${JSON.stringify(text)}; const els = [...document.querySelectorAll('button')].filter(b => !b.disabled && (${exact} ? b.innerText.trim() === t : b.innerText.includes(t))); if (!els.length) return false; els[els.length - 1].click(); return true; })()`);
    if (!ok) log('no button', text); await sleep(300); return ok;
  };
  const nav = async (t) => { const ok = await js('(() => { const b = [...document.querySelectorAll("aside button")].find(b => b.innerText.split("\\n")[0].trim() === ' + JSON.stringify(t) + '); if (b) b.click(); return !!b; })()'); await sleep(500); return ok; };
  const statusText = () => js(`document.querySelector('footer span:last-child')?.innerText || ''`);
  const askOpen = () => js(`!!document.querySelector('.z-\\\\[60\\\\]')`);
  const answer = async (btn) => { await waitFor(`!!document.querySelector('.z-\\\\[60\\\\]')`, 15000, 'question box'); await shot('ask-' + btn.replace(/\W+/g, '')); await click(btn); };
  const open = (p) => wc.send('open-arg', p);
  try {
    await waitFor(`(document.querySelector('footer')?.innerText || '').includes('Ready')`, 30000, 'ready');
    await nav('My Mods'); await waitFor(`document.body.innerText.includes('installed without this app')`, 15000, 'found bar');
    await shot('my-mods-first');
    await click('Review'); await sleep(500); await shot('found-mods');
    await click('Add to My Mods'); await sleep(1500);
    // install the Coach mod (a folder) - it has .NET-free data lines
    open(path.join(M, 'Coach Bus')); await waitFor(`document.body.innerText.includes('Mod name')`); await shot('install-plan-coach');
    await click('Install'); await waitFor(`(document.querySelector('footer')?.innerText || '').includes('Delivered')`, 30000, 'coach delivered');
    // two HUD mods that change the same texture file
    for (const z of ['Neon HUD.zip', 'Gold Weapons HUD.zip']) {
      open(path.join(M, z)); await waitFor(`document.body.innerText.includes('Mod name')`);
      if (z.startsWith('Gold')) await shot('install-plan-hud');
      await click('Install'); await sleep(800);
      if (await askOpen()) await answer('Yes');
      await waitFor(`(document.querySelector('footer')?.innerText || '').includes('Delivered')`, 30000, z + ' delivered');
    }
    // Niko's jacket goes inside playerped.rpf (asks to back up the original)
    open(path.join(M, 'Niko Red Jacket.zip')); await waitFor(`document.body.innerText.includes('Mod name')`); await shot('install-plan-archive');
    await click('Install'); await sleep(800); if (await askOpen()) await answer('No');
    await waitFor(`(document.querySelector('footer')?.innerText || '').includes('Delivered')`, 30000, 'jacket delivered');
    await nav('My Mods'); await sleep(800); await shot('my-mods-installed');
    await click('Check for Conflicts'); await sleep(1200); await shot('conflicts'); await click('Close');
    // turn the Neon HUD off and on with the tick
    await js(`(() => { const row = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Neon HUD')); row.parentElement.querySelector('button[title]').click(); })()`); await sleep(1500); await shot('neon-off');
    await js(`(() => { const row = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Neon HUD')); row.parentElement.querySelector('button[title]').click(); })()`); await sleep(1500);
    // details window
    await js(`[...document.querySelectorAll('button')].find(b => b.innerText.includes('Coach Bus')).click()`); await sleep(600); await shot('mod-details'); await click('Close', false) || await js(`document.querySelector('.fixed.inset-0 button')?.click()`);
    await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await sleep(300);
    await js(`(() => { const x = [...document.querySelectorAll('.fixed.inset-0.z-50 button')]; const c = x.find(b => !b.innerText.trim()); c && c.click(); })()`); await sleep(400);
    // find the broken mod: first test
    await click('Find the Broken Mod'); await answer('Yes'); await waitFor(`document.body.innerText.includes('Test 1')`, 20000, 'test 1'); await shot('find-broken');
    await click("It's Gone"); await sleep(1500); await shot('find-broken-2'); await click('Stop'); await sleep(1500);
    // clean up
    await click('Clean Up'); await sleep(1500); await shot('clean-up'); await click('Close');
    // archives + textures
    await nav('Archives'); await sleep(1500);
    await js(`[...document.querySelectorAll('button')].find(b => b.innerText.startsWith('vehicles.img')).click()`); await sleep(1200); await shot('archives');
    await js(`(() => { const r = [...document.querySelectorAll('div')].find(d => d.innerText === 'blips.wtd' || (d.children.length===4 && d.children[0].innerText==='blips.wtd')); const row = [...document.querySelectorAll('span')].find(s => s.innerText === 'blips.wtd').parentElement; row.dispatchEvent(new MouseEvent('dblclick', {bubbles:true})); })()`);
    await sleep(1500); await shot('textures');
    // replace the "star" picture with a png, then Use Changes -> it becomes a mod in Install
    await js(`[...document.querySelectorAll('button')].find(b => b.innerText.startsWith('star')).click()`); await sleep(500);
    global.__testDialogs = [path.join(M, 'new-star.png')];
    await click('Replace Picture...'); await sleep(1500); await shot('texture-replaced');
    await click('Use Changes'); await waitFor(`document.body.innerText.includes('Mod name')`, 15000, 'replace plan'); await shot('replace-plan');
    await click('Install'); await waitFor(`(document.querySelector('footer')?.innerText || '').includes('Delivered')`, 30000, 'replace delivered');
    // share: save the list
    await nav('My Mods'); global.__testDialogs = [path.join(M, 'list.lcmods')]; await click('Share'); await answer('Save My List'); await sleep(1500);
    log('list saved:', fs.existsSync(path.join(M, 'list.lcmods')));
    // uninstall the Gold Weapons HUD from its details window
    await js(`[...document.querySelectorAll('button')].find(b => b.innerText.includes('Gold Weapons HUD')).click()`); await sleep(600);
    await click('Uninstall'); await answer('Yes'); await sleep(2000); await shot('after-uninstall');
    await nav('Settings'); await sleep(1500); await shot('settings');
    await js(`[...document.querySelectorAll('main .overflow-y-auto')].forEach(e => e.scrollTop = 99999)`); await sleep(500); await shot('settings-bottom');
    await nav('Get Mods'); await sleep(800); await shot('get-mods');
    await nav('Install'); await sleep(500); await shot('install-empty');
    // music panel
    await js(`document.querySelector('header button[title]')?.click()`); await sleep(500); await shot('music');
    log('engine files:', JSON.stringify(await callEngine('myMods').then(m => m.map(x => x.name + ':' + (x.on ? 'on' : 'off')))));
  } catch (e) { log('ERROR', e.stack || e.message); }
  setTimeout(() => require('electron').app.quit(), 500);
};
