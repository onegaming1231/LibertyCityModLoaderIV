// takes matching "before / after" pictures from the 3D View and the Textures window (for the Nexus page)
const fs = require('fs'), path = require('path');
const OUT = process.env.LCML_SHOTS, C = process.env.LCML_CMP;
module.exports = async function (win) {
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(code, true);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const log = (...a) => console.log('[cmp]', ...a);
  const waitFor = async (cond, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await js(cond)) return true; } catch (e) { /* */ } await sleep(200); } log('TIMEOUT', cond); return false; };
  const click = (t) => js(`(() => { const b = [...document.querySelectorAll('button')].filter(b => !b.disabled && b.innerText.trim() === ${JSON.stringify(t)}); if (b.length) b[b.length - 1].click(); return b.length; })()`);
  const nav = (t) => js('(() => { const b = [...document.querySelectorAll("aside button")].find(b => b.innerText.split("\\n")[0].trim() === ' + JSON.stringify(t) + '); if (b) b.click(); return !!b; })()');
  const grab = async (sel, name) => {
    await sleep(900);
    const r = await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }; })()`);
    const img = await wc.capturePage(r); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); log('shot', name, JSON.stringify(r));
  };
  const zoom = async (d) => { await js(`document.querySelector('.fixed canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: ${d}, bubbles: true, cancelable: true }))`); await sleep(400); };
  const drag = async (dx, dy) => {
    await js(`(() => { const c = document.querySelector('.fixed canvas'); const r = c.getBoundingClientRect(); window.__p = [r.x + r.width / 2, r.y + r.height / 2]; c.dispatchEvent(new MouseEvent('mousedown', { clientX: __p[0], clientY: __p[1], button: 0, bubbles: true })); })()`);
    for (let i = 1; i <= 10; i++) { await js(`window.dispatchEvent(new MouseEvent('mousemove', { clientX: __p[0] + ${dx} * ${i / 10}, clientY: __p[1] + ${dy} * ${i / 10}, bubbles: true }))`); await sleep(30); }
    await js(`window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))`); await sleep(300);
  };
  const open3d = async (file) => { global.__testDialogs = [file]; await click('Open 3D Model...'); await waitFor(`!!document.querySelector('.fixed canvas')`); await sleep(1500); };
  const close = async () => { await click('Close'); await sleep(600); };
  try {
    win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
    await waitFor(`(document.querySelector('footer')?.innerText || '').includes('Ready')`);
    await nav('Archives'); await sleep(1200);
    // character: plain texture vs the mod's texture with a gold chain
    for (const [dir, name] of [['headA', 'char-a'], ['headC', 'char-b']]) {
      await open3d(path.join(C, dir, 'head_000_r.wdr'));
      await zoom(-260);
      await grab('.fixed canvas', name); await close();
    }
    // car: two paint colors, same view
    for (const [col, name] of [['#c8ccd2', 'car-a'], ['#a3121b', 'car-b']]) {
      await open3d(path.join(C, 'car', 'coach.wft'));
      await js(`document.querySelector('button[title="${col}"]').click()`); await zoom(-180);
      await grab('.fixed canvas', name); await close();
    }
    // texture: the original picture vs a new one
    global.__testDialogs = [path.join(C, 'car', 'coach.wtd')];
    await click('Open .wtd File...'); await waitFor(`!!document.querySelector('.fixed.inset-0.z-50')`); await sleep(1200);
    await js(`[...document.querySelectorAll('button')].find(b => b.innerText.startsWith('coach_livery')).click()`); await sleep(1200);
    await grab('.fixed.inset-0.z-50 .flex-1.flex.items-center', 'tex-a');
    global.__testDialogs = [path.join(C, 'livery-mod.png')];
    await click('Replace Picture...'); await sleep(2500);
    await grab('.fixed.inset-0.z-50 .flex-1.flex.items-center', 'tex-b');
  } catch (e) { log('ERROR', e.stack || e.message); }
  setTimeout(() => require('electron').app.quit(), 500);
};
