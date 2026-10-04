// 3D view check: opens a model from a file and takes pictures from a few sides
const fs = require('fs'), path = require('path');
const OUT = process.env.LCML_SHOTS, FILE = process.env.LCML_MODEL;
module.exports = async function (win) {
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(code, true);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const log = (...a) => console.log('[e2e]', ...a);
  const shot = async (name) => { await sleep(800); const img = await wc.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); log('shot', name); };
  const waitFor = async (cond, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await js(cond)) return true; } catch (e) { /* */ } await sleep(250); } log('TIMEOUT', cond); return false; };
  const click = (t) => js(`(() => { const b = [...document.querySelectorAll('button')].filter(b => !b.disabled && b.innerText.trim() === ${JSON.stringify(t)}); if (b.length) b[b.length - 1].click(); return b.length; })()`);
  try {
    await waitFor(`(document.querySelector('footer')?.innerText || '').includes('Ready')`, 30000);
    await js('(() => { const b = [...document.querySelectorAll("aside button")].find(b => b.innerText.split("\\n")[0].trim() === "Archives"); b && b.click(); })()'); await sleep(1500);
    for (const f of FILE.split(';')) {
      global.__testDialogs = [f];
      await click('Open 3D Model...');
      await waitFor(`document.body.innerText.includes('3D View')`, 30000); await sleep(1500);
      const nm = path.basename(f);
      log('info', await js(`document.querySelector('.fixed.inset-0')?.innerText.slice(0, 400)`));
      await shot(nm + '-1');
      // turn it a bit
      await js(`(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); const ev = (t, x, y) => (t === 'mousedown' ? c : window).dispatchEvent(new MouseEvent(t, { clientX: x, clientY: y, button: 0, bubbles: true })); ev('mousedown', r.x + 100, r.y + 100); ev('mousemove', r.x + 260, r.y + 60); ev('mouseup', r.x + 260, r.y + 60); })()`);
      await shot(nm + '-2');
      await js(`(() => { const c = document.querySelector('canvas'); c.dispatchEvent(new WheelEvent('wheel', { deltaY: -500, bubbles: true, cancelable: true })); })()`);
      await shot(nm + '-3');
      await click('Close');
      await sleep(500);
    }
  } catch (e) { log('ERROR', e.stack || e.message); }
  setTimeout(() => require('electron').app.quit(), 500);
};
