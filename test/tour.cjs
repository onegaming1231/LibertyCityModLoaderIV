// Showcase tour: sets the app up with a few mods, then records a preview video and takes screenshots.
// Env: LCML_SHOTS (out folder), LCML_MODS, LCML_GAME, LCML_HEAD (a character .wdr), LCML_W/LCML_H (screen size)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const OUT = process.env.LCML_SHOTS, M = process.env.LCML_MODS, HEAD = process.env.LCML_HEAD;
const W = +process.env.LCML_W || 1600, H = +process.env.LCML_H || 900;
module.exports = async function (win) {
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(code, true);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const log = (...a) => console.log('[tour]', ...a);
  const shot = async (name) => { await sleep(500); const img = await wc.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); log('shot', name); };
  const waitFor = async (cond, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await js(cond)) return true; } catch (e) { /* */ } await sleep(200); } log('TIMEOUT', cond); return false; };
  const click = (t) => js(`(() => { const b = [...document.querySelectorAll('button')].filter(b => !b.disabled && b.innerText.trim() === ${JSON.stringify(t)}); if (b.length) b[b.length - 1].click(); return b.length; })()`);
  const nav = (t) => js('(() => { const b = [...document.querySelectorAll("aside button")].find(b => b.innerText.split("\\n")[0].trim() === ' + JSON.stringify(t) + '); if (b) b.click(); return !!b; })()');
  const askOpen = () => js(`!!document.querySelector('.z-\\\\[60\\\\]')`);
  const answer = async (btn) => { await waitFor(`!!document.querySelector('.z-\\\\[60\\\\]')`, 15000); await click(btn); };
  const open = (p) => wc.send('open-arg', p);
  const delivered = () => waitFor(`(document.querySelector('footer')?.innerText || '').includes('Delivered')`, 30000);
  // a caption at the bottom of the video (not in the screenshots)
  const caption = (t, sub = '') => js(`(() => {
    let c = document.getElementById('tour-cap');
    if (!c) { c = document.createElement('div'); c.id = 'tour-cap';
      c.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;pointer-events:none;background:rgba(10,12,16,.88);border:1px solid rgba(108,164,216,.55);border-radius:14px;padding:12px 26px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.6);transition:opacity .35s';
      document.body.appendChild(c); }
    c.style.opacity = ${t ? 1 : 0};
    c.innerHTML = ${JSON.stringify(t ? `<div style="font-family:'Bebas Neue',sans-serif;font-size:34px;letter-spacing:1px;color:#fff;line-height:1">${t}</div>` + (sub ? `<div style="font-family:Barlow,sans-serif;font-size:16px;color:#b9d6f1;margin-top:4px">${sub}</div>` : '') : '')};
  })()`);
  const noCap = async () => { await js(`(() => { const c = document.getElementById('tour-cap'); if (c) c.style.opacity = 0; })()`); await sleep(450); };
  const drag = async (dx, dy, steps = 40, ms = 2000, button = 0) => {
    await js(`(() => { window.__c = document.querySelector('.fixed canvas'); const r = __c.getBoundingClientRect(); window.__p = [r.x + r.width / 2, r.y + r.height / 2]; __c.dispatchEvent(new MouseEvent('mousedown', { clientX: __p[0], clientY: __p[1], button: ${button}, bubbles: true })); })()`);
    for (let i = 1; i <= steps; i++) { await js(`window.dispatchEvent(new MouseEvent('mousemove', { clientX: __p[0] + ${dx} * ${i / steps}, clientY: __p[1] + ${dy} * ${i / steps}, bubbles: true }))`); await sleep(ms / steps); }
    await js(`window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))`);
  };
  const zoom = async (d, steps = 20, ms = 1200) => { for (let i = 0; i < steps; i++) { await js(`document.querySelector('.fixed canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: ${d / steps}, bubbles: true, cancelable: true }))`); await sleep(ms / steps); } };
  const closeModal = () => js(`(() => { const x = [...document.querySelectorAll('.fixed.inset-0.z-50 button')].filter(b => b.innerText.trim() === 'Close'); if (x.length) x[x.length - 1].click(); })()`);
  const scrollMain = (y) => js(`[...document.querySelectorAll('main .overflow-y-auto')].forEach(e => e.scrollTo({ top: ${y}, behavior: 'smooth' }))`);

  let rec = null;
  try {
    win.setBounds({ x: 0, y: 0, width: W, height: H });
    await waitFor(`(document.querySelector('footer')?.innerText || '').includes('Ready')`, 30000);
    // ---- set up: a few mods installed ----
    await nav('My Mods'); await waitFor(`document.body.innerText.includes('installed without this app')`, 15000);
    await click('Review'); await sleep(500); await click('Add to My Mods'); await sleep(1500);
    open(path.join(M, 'Coach Bus')); await waitFor(`document.body.innerText.includes('Mod name')`); await click('Install'); await delivered();
    for (const z of ['Neon HUD.zip', 'Gold Weapons HUD.zip']) {
      open(path.join(M, z)); await waitFor(`document.body.innerText.includes('Mod name')`); await click('Install'); await sleep(800);
      if (await askOpen()) await answer('Yes'); await delivered();
    }
    open(path.join(M, 'Niko Red Jacket.zip')); await waitFor(`document.body.innerText.includes('Mod name')`); await click('Install'); await sleep(800);
    if (await askOpen()) await answer('No'); await delivered();
    await nav('My Mods'); await sleep(1500);
    await js(`document.querySelector('footer span:last-child') && (document.querySelector('footer span:last-child').innerText = 'Ready.')`);

    // ---- recording ----
    rec = cp.spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30', '-video_size', W + 'x' + H, '-i', process.env.DISPLAY + '.0+0,0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', path.join(OUT, 'raw.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
    await sleep(1500);

    // 1. My Mods
    await shot('01-my-mods');
    await caption('My Mods', 'Every mod in one list. Tick to turn it on or off - nothing is deleted.'); await sleep(3500);
    await js(`(() => { const row = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Neon HUD')); row.parentElement.querySelector('button[title]').click(); })()`); await sleep(1800);
    await js(`(() => { const row = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Neon HUD')); row.parentElement.querySelector('button[title]').click(); })()`); await sleep(1800);

    // 2. Conflicts + texture mixing
    await noCap(); await click('Check for Conflicts'); await sleep(1200);
    await shot('02-conflicts');
    await caption('Check for Conflicts', 'See which mods change the same files. Two HUD mods? Their textures are mixed so both work.'); await sleep(4500);
    await closeModal(); await sleep(600);

    // 3. Install
    await noCap(); open(path.join(M, 'Coach Bus')); await waitFor(`document.body.innerText.includes('Mod name')`); await sleep(800);
    await shot('03-install');
    await caption('Install', 'Drop in a .zip, .rar, .7z, .oiv or a folder. The app shows where every file goes.'); await sleep(4500);
    await click('Cancel'); await sleep(600);

    // 4. Archives + textures
    await noCap(); await nav('Archives'); await sleep(1500);
    await js(`[...document.querySelectorAll('button')].find(b => b.innerText.startsWith('vehicles.img')).click()`); await sleep(1200);
    await shot('04-archives');
    await caption('Game Archives', 'Look inside .img and .rpf files. Take files out, replace them or add new ones.'); await sleep(3500);
    await noCap();
    await js(`(() => { const row = [...document.querySelectorAll('span')].find(s => s.innerText === 'coach.wtd').parentElement; row.click(); row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); })()`);
    await waitFor(`!!document.querySelector('.fixed.inset-0.z-50')`, 15000); await sleep(1200);
    await js(`[...document.querySelectorAll('button')].find(b => b.innerText.startsWith('coach_livery')).click()`); await sleep(1200);
    await shot('05-textures');
    await caption('Textures', 'See every picture in a .wtd file. Save it, or replace it with your own.'); await sleep(2500);
    for (const t of ['coach_interior', 'coach_sign_1', 'coach_lights']) { await js(`[...document.querySelectorAll('button')].find(b => b.innerText.startsWith('${t}'))?.click()`); await sleep(1300); }
    await noCap(); await click('Close'); await sleep(700);

    // 5. 3D View - car
    await js(`(() => { const row = [...document.querySelectorAll('span')].find(s => s.innerText === 'coach.wft').parentElement; row.click(); row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); })()`);
    await waitFor(`!!document.querySelector('.fixed canvas')`, 30000); await sleep(1500);
    await shot('06-3d-car');
    await caption('NEW: 3D View', 'See cars, characters and objects in 3D with their textures.');
    await drag(-260, 0, 50, 3000); await sleep(400);
    await drag(0, 70, 20, 1000); await sleep(300);
    for (const c of ['#a3121b', '#1f4fa8', '#e2b007']) { await js(`document.querySelector('button[title="${c}"]').click()`); await sleep(1000); }
    await shot('07-3d-car-paint');
    await zoom(-500); await sleep(500); await drag(-200, -40, 40, 2500); await sleep(500);
    await noCap(); await click('Close'); await sleep(700);

    // 6. 3D View - character (from a file)
    if (HEAD) {
      global.__testDialogs = [HEAD];
      await click('Open 3D Model...'); await waitFor(`!!document.querySelector('.fixed canvas')`, 30000); await sleep(1200);
      await caption('Characters too', 'Open any model file - even before you install a mod.');
      await shot('08-3d-character');
      await drag(-300, 0, 60, 3500); await sleep(800);
      await noCap(); await click('Close'); await sleep(700);
    }

    // 7. Something wrong?
    await nav('My Mods'); await sleep(1000);
    await click('Find the Broken Mod'); await answer('Yes'); await waitFor(`document.body.innerText.includes('Test 1')`, 20000); await sleep(800);
    await shot('09-find-broken');
    await caption('Find the Broken Mod', 'Game crashing? Answer a few questions and the app finds the mod that breaks it.'); await sleep(4500);
    await noCap(); await click('Stop'); await sleep(1500);

    // 8. Settings
    await nav('Settings'); await sleep(1500);
    await shot('10-settings');
    await caption('Settings', 'Fusion Fix settings, essential tools, your own background and music.'); await sleep(2000);
    await scrollMain(700); await sleep(2500);
    await scrollMain(0); await sleep(1000);

    // end
    await nav('My Mods'); await sleep(800);
    await caption('Liberty City Mod Loader IV', 'Free on Nexus Mods and GitHub - by AnnaEnxo'); await sleep(4000);
    await noCap(); await sleep(800);
  } catch (e) { log('ERROR', e.stack || e.message); }
  if (rec) { try { rec.stdin.write('q'); } catch (e) { /* */ } await new Promise(r => rec.on('exit', r)); }
  setTimeout(() => require('electron').app.quit(), 500);
};
