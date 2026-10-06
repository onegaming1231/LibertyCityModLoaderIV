'use strict';
// Liberty City Mod Loader IV - the window. The engine (all file work) runs in its own background process.
const { app, BrowserWindow, ipcMain, dialog, shell, session, protocol, net, safeStorage, utilityProcess, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const { pathToFileURL } = require('url');

const APP_NAME = 'Liberty City Mod Loader IV';
const IS_WIN = process.platform === 'win32';
app.setName(APP_NAME);
if (process.env.LCML_USERDATA) app.setPath('userData', process.env.LCML_USERDATA);   // tests only
if (IS_WIN) app.setAppUserModelId('LibertyCity.ModLoaderIV');

let win = null, engine = null, engineReady = null;
const pendingCalls = new Map(); let callId = 0;
const pendingHost = new Map(); let hostSeq = 0;

// ---------------------------------------------------------------- one copy of the app at a time
// the mod (or nxm:// link) the app was started with: the first argument after the program (and after the app folder when not packaged)
const firstArg = (argv) => { const a = argv.slice(1).filter(x => x && !x.startsWith('--')); if (!app.isPackaged) a.shift(); return a.find(x => /^nxm:\/\//i.test(x) || fs.existsSync(x)); };
if (!app.requestSingleInstanceLock()) { app.quit(); }
else app.on('second-instance', (e, argv) => { const a = firstArg(argv); if (win) { if (win.isMinimized()) win.restore(); win.focus(); } if (a) sendToWindow('open-arg', a); });

// local files for the window (background videos, music, pictures) - read only
protocol.registerSchemesAsPrivileged([{ scheme: 'lcml', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true } }]);

function sendToWindow(ch, ...args) { if (win && !win.isDestroyed()) win.webContents.send(ch, ...args); }

// ---------------------------------------------------------------- engine process
function startEngine() {
  engine = utilityProcess.fork(path.join(__dirname, 'engine', 'worker.cjs'), [], { serviceName: 'LCML Engine', stdio: 'pipe' });
  engine.stdout && engine.stdout.on('data', d => process.stdout.write(d));
  engine.stderr && engine.stderr.on('data', d => process.stderr.write(d));
  engine.on('message', async (msg) => {
    if (!msg) return;
    if (msg.t === 'result') { const p = pendingCalls.get(msg.id); if (p) { pendingCalls.delete(msg.id); msg.ok ? p.resolve(msg.value) : p.reject(Object.assign(new Error(msg.error), { friendly: msg.friendly })); } return; }
    if (msg.t === 'status') { sendToWindow('status', msg.text, msg.color); return; }
    if (msg.t === 'trash') { shell.trashItem(msg.path).catch(() => { try { fs.rmSync(msg.path, { force: true }); } catch (e) { /* */ } }); return; }
    if (msg.t === 'host') {
      let value = null;
      try {
        if (msg.kind === 'secret') {
          const { op, value: v } = msg.args;
          if (op === 'encrypt') value = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(v).toString('base64') : 'plain:' + Buffer.from(v).toString('base64');
          else value = String(v).startsWith('plain:') ? Buffer.from(String(v).slice(6), 'base64').toString() : safeStorage.decryptString(Buffer.from(v, 'base64'));
        } else if (msg.kind === 'open') {
          // only the Nexus Mods login page is opened this way
          const u = String(msg.args.url || '');
          if (/^https:\/\/users\.nexusmods\.com\/oauth\/authorize\?/.test(u)) { await shell.openExternal(u); value = true; }
        } else value = await askWindow(msg.kind, msg.args);
      } catch (e) { value = null; }
      engine.postMessage({ t: 'host-reply', id: msg.id, value });
    }
  });
  engine.on('exit', (code) => {
    for (const p of pendingCalls.values()) p.reject(new Error('The engine stopped (code ' + code + '). Please try again.'));
    pendingCalls.clear();
    if (!app.isQuitting) setTimeout(startEngine, 500);
  });
}
function callEngine(fn, ...args) {
  return new Promise((resolve, reject) => { const id = ++callId; pendingCalls.set(id, { resolve, reject }); engine.postMessage({ t: 'call', id, fn, args }); });
}
// the engine asks the window something (a question box, or picture work done with the window's canvas)
function askWindow(kind, args) {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed()) return resolve(kind === 'ask' && args.buttons ? args.buttons[args.buttons.length - 1] : null);
    const id = ++hostSeq; pendingHost.set(id, resolve); win.webContents.send('host', id, kind, args);
  });
}
ipcMain.on('host-reply', (e, id, value) => { const r = pendingHost.get(id); if (r) { pendingHost.delete(id); r(value); } });
ipcMain.handle('engine', async (e, fn, args) => {
  try { return { ok: true, value: await callEngine(fn, ...(args || [])) }; }
  catch (err) { return { ok: false, error: err.message, friendly: !!err.friendly }; }
});

// ---------------------------------------------------------------- per-PC app settings (look, music) in %APPDATA%
const userDir = () => app.getPath('userData');
const lookPath = () => path.join(userDir(), 'look.json');
ipcMain.handle('look:get', () => {
  try { return JSON.parse(fs.readFileSync(lookPath(), 'utf8')); } catch (e) { /* first start */ }
  // first start after the old version: keep its music settings
  try {
    let t = fs.readFileSync(path.join(app.getPath('appData'), 'LibertyCityModInstaller', 'look.json'), 'utf8'); if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
    const m = JSON.parse(t).music;
    if (m) return { music: { source: m.Source || 'Off', folder: m.Folder || '', volume: Number(m.Volume) || 40, token: m.Token || '', port: Number(m.Port) || 26538 } };
  } catch (e) { /* none */ }
  return {};
});
ipcMain.handle('look:set', (e, o) => { fs.mkdirSync(userDir(), { recursive: true }); fs.writeFileSync(lookPath(), JSON.stringify(o, null, 2)); cleanBackgrounds(o); return true; });
const bgDir = () => path.join(userDir(), 'backgrounds');
ipcMain.handle('look:import', (e, file) => {
  fs.mkdirSync(bgDir(), { recursive: true });
  const dest = path.join(bgDir(), 'bg-' + Math.random().toString(16).slice(2, 10) + path.extname(file).toLowerCase());
  fs.copyFileSync(file, dest); return dest;
});
function cleanBackgrounds(o) {
  try { const used = JSON.stringify(o || {}); for (const n of fs.readdirSync(bgDir())) if (!used.includes(n)) fs.rmSync(path.join(bgDir(), n), { force: true }); } catch (e) { /* */ }
}

// ---------------------------------------------------------------- dialogs and shell
ipcMain.handle('dlg:open', async (e, o) => {
  if (global.__testDialogs && global.__testDialogs.length) return global.__testDialogs.shift();   // tests only
  const r = await dialog.showOpenDialog(win, { title: o.title, defaultPath: o.defaultPath, filters: o.filters, properties: o.folder ? ['openDirectory'] : (o.multi ? ['openFile', 'multiSelections'] : ['openFile']) });
  return r.canceled ? null : (o.multi ? r.filePaths : r.filePaths[0]);
});
ipcMain.handle('dlg:save', async (e, o) => { if (global.__testDialogs && global.__testDialogs.length) return global.__testDialogs.shift(); const r = await dialog.showSaveDialog(win, { title: o.title, defaultPath: o.defaultPath, filters: o.filters }); return r.canceled ? null : r.filePath; });
ipcMain.handle('shell:external', (e, url) => { if (/^(https?|steam):\/\//i.test(url)) return shell.openExternal(url); return false; });
ipcMain.handle('shell:open', (e, p) => shell.openPath(p));
ipcMain.handle('shell:show', (e, p) => shell.showItemInFolder(p));
ipcMain.handle('file:writePng', (e, p, b64) => { fs.writeFileSync(p, Buffer.from(b64, 'base64')); return true; });
ipcMain.handle('file:read', (e, p) => fs.readFileSync(p));
ipcMain.handle('file:exists', (e, p) => fs.existsSync(p));
ipcMain.handle('app:info', () => ({ version: '1.0', platform: process.platform, exe: process.execPath, packaged: app.isPackaged, arg: firstArg(process.argv) || '' }));

// ---------------------------------------------------------------- start the game
ipcMain.handle('game:launch', async (e, dir) => {
  for (const n of ['PlayGTAIV.exe', 'GTAIV.exe', 'LaunchGTAIV.exe']) {
    const exe = path.join(dir || '', n);
    if (dir && fs.existsSync(exe)) { const c = cp.spawn(exe, [], { cwd: dir, detached: true, stdio: 'ignore' }); c.unref(); return { ok: true, how: n }; }
  }
  await shell.openExternal('steam://rungameid/12210'); return { ok: true, how: 'Steam' };
});

// ---------------------------------------------------------------- Windows registry: right-click install, Nexus buttons
function reg(args) { try { return cp.execFileSync('reg', args, { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } }
function regGet(key, name) { const out = reg(['query', key, ...(name ? ['/v', name] : ['/ve'])]); if (!out) return null; const m = /REG_\w+\s+(.*)/.exec(out.split(/\r?\n/).find(l => /REG_/.test(l)) || ''); return m ? m[1].trim() : ''; }
const launchCommand = () => '"' + process.execPath + '"' + (app.isPackaged ? '' : ' "' + app.getAppPath() + '"') + ' "%1"';
const MENU_EXTS = ['.zip', '.rar', '.7z', '.oiv'];
ipcMain.handle('reg:menu', (e, on) => {
  if (!IS_WIN) return false;
  for (const x of MENU_EXTS) {
    const k = 'HKCU\\Software\\Classes\\SystemFileAssociations\\' + x + '\\shell\\LCModInstaller';
    if (on) { reg(['add', k, '/ve', '/d', 'Install with ' + APP_NAME, '/f']); reg(['add', k, '/v', 'Icon', '/d', process.execPath, '/f']); reg(['add', k + '\\command', '/ve', '/d', launchCommand(), '/f']); }
    else reg(['delete', k, '/f']);
  }
  return true;
});
ipcMain.handle('reg:menuState', () => IS_WIN && !!regGet('HKCU\\Software\\Classes\\SystemFileAssociations\\.zip\\shell\\LCModInstaller\\command'));
ipcMain.handle('reg:nxmState', () => IS_WIN && /Liberty City Mod Loader IV/i.test(regGet('HKCU\\Software\\Classes\\nxm\\shell\\open\\command') || ''));
ipcMain.handle('reg:nxm', async (e, on) => {
  if (!IS_WIN) return false;
  const k = 'HKCU\\Software\\Classes\\nxm', cmdKey = k + '\\shell\\open\\command';
  const s = await callEngine('settings').catch(() => ({}));
  if (on) {
    const old = regGet(cmdKey);
    if (old && !/Liberty City Mod Loader IV/i.test(old)) await callEngine('saveSettings', { OldNxm: old }).catch(() => {});
    reg(['add', k, '/ve', '/d', 'URL:NXM Protocol', '/f']); reg(['add', k, '/v', 'URL Protocol', '/d', '', '/f']); reg(['add', cmdKey, '/ve', '/d', launchCommand(), '/f']);
  } else if (s && s.OldNxm) reg(['add', cmdKey, '/ve', '/d', s.OldNxm, '/f']);
  else reg(['delete', k, '/f']);
  return true;
});
// right-click and Nexus entries made by the old PowerShell version (or another copy of this app) point at this app now
function updateOldLaunchers() {
  if (!IS_WIN || !app.isPackaged) return;
  const me = process.execPath.toLowerCase();
  for (const x of MENU_EXTS) {
    const k = 'HKCU\\Software\\Classes\\SystemFileAssociations\\' + x + '\\shell\\LCModInstaller';
    const cur = regGet(k + '\\command');
    if (cur && !cur.toLowerCase().includes(me)) { reg(['add', k, '/ve', '/d', 'Install with ' + APP_NAME, '/f']); reg(['add', k + '\\command', '/ve', '/d', launchCommand(), '/f']); }
  }
  const nk = 'HKCU\\Software\\Classes\\nxm\\shell\\open\\command', cur = regGet(nk);
  if (cur && /Liberty City Mod (Installer|Loader)/i.test(cur) && !cur.toLowerCase().includes(me)) reg(['add', nk, '/ve', '/d', launchCommand(), '/f']);
}

// ---------------------------------------------------------------- watching the Downloads folder
let watcher = null; const offered = new Set();
ipcMain.handle('watch:set', async (e, on) => {
  if (watcher) { watcher.close(); watcher = null; }
  if (!on) return false;
  const dir = await callEngine('downloadsFolder').catch(() => null);
  if (!dir || !fs.existsSync(dir)) return false;
  watcher = fs.watch(dir, (ev, name) => {
    if (!name || !/\.(zip|rar|7z|oiv)$/i.test(name)) return;
    const p = path.join(dir, name);
    setTimeout(() => {
      if (offered.has(p)) return;
      try { if (!fs.statSync(p).size) return; const fd = fs.openSync(p, 'r+'); fs.closeSync(fd); } catch (er) { return; }
      offered.add(p); sendToWindow('download-landed', p);
    }, 1500);
  });
  return dir;
});

// ---------------------------------------------------------------- music: your folder, and the YouTube Music app (API Server plugin)
ipcMain.handle('music:list', (e, folder) => {
  const out = []; const walk = (d) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (er) { return; } for (const x of ents) { const p = path.join(d, x.name); if (x.isDirectory()) walk(p); else if (/\.(mp3|wav|wma|m4a|aac|flac|ogg)$/i.test(x.name)) out.push(p); } };
  if (folder) walk(folder); return out;
});
ipcMain.handle('ytm', async (e, base, token, method, p, body) => {
  try {
    const res = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(method === 'POST' && /auth/.test(p) ? 60000 : 4000) });
    let data = null; const t = await res.text(); try { data = JSON.parse(t); } catch (er) { data = t; }
    return { code: res.status, data };
  } catch (er) { return { code: -1, data: null }; }
});

// ---------------------------------------------------------------- the built-in browser (Get Mods): downloads, Nexus buttons
const ARCHIVE_MIME = { 'application/zip': '.zip', 'application/x-zip-compressed': '.zip', 'application/x-zip': '.zip', 'application/x-rar-compressed': '.rar', 'application/vnd.rar': '.rar', 'application/x-rar': '.rar', 'application/x-7z-compressed': '.7z' };
const VIDEO = /\.(mp4|webm|mov|m4v|mkv|wmv|avi)$/i;
function hookBrowserSession() {
  const ses = session.fromPartition('persist:mods');
  ses.on('will-download', async (event, item, wc) => {
    let name = item.getFilename(); const ext = path.extname(name).toLowerCase();
    const title = wc && !wc.isDestroyed() ? wc.getTitle() : '';
    let kind = null;
    if (VIDEO.test(name)) kind = 'video';
    else if (['.zip', '.rar', '.7z', '.oiv'].includes(ext)) kind = 'mod';
    else if (ARCHIVE_MIME[(item.getMimeType() || '').toLowerCase()]) { name += ARCHIVE_MIME[item.getMimeType().toLowerCase()]; kind = 'mod'; }
    if (!kind) return;   // not a mod: a normal download
    let dir;
    if (kind === 'video') dir = bgDir();
    else { const d = await Promise.resolve(callEngine('dataDir')).catch(() => ''); dir = d ? path.join(d, 'downloads') : path.join(app.getPath('downloads')); }
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, kind === 'video' ? 'bg-' + Math.random().toString(16).slice(2, 10) + ext : name.replace(/[\\/:*?"<>|]/g, '_'));
    item.setSavePath(dest);
    let last = 0, lastBytes = 0, lastTick = Date.now(), speed = 0;
    item.on('updated', () => {
      const now = Date.now(); if (now - last < 250) return; last = now;
      const got = item.getReceivedBytes(), total = item.getTotalBytes(), dt = (now - lastTick) / 1000;
      if (dt >= 1) { speed = (got - lastBytes) / 1048576 / dt; lastBytes = got; lastTick = now; }
      sendToWindow('status', 'Downloading ' + (kind === 'video' ? 'live wallpaper' : name) + '   ' + (total ? Math.round(100 * got / total) + '%   ' : '') + (got / 1048576).toFixed(1) + (total ? ' of ' + (total / 1048576).toFixed(1) : '') + ' MB' + (speed ? '   -   ' + speed.toFixed(2) + ' MB/s' : ''), 'text');
    });
    item.once('done', (e2, state) => {
      if (state !== 'completed') { sendToWindow('status', 'Download stopped: ' + state, 'red'); return; }
      if (kind === 'video') sendToWindow('live-wallpaper', dest);
      else sendToWindow('downloaded', { path: dest, title });
    });
  });
  // Nexus "Mod Manager Download" (nxm://) inside the browser
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    if (permission === 'openExternal' && details && /^nxm:\/\//i.test(details.externalURL || '')) { sendToWindow('open-arg', details.externalURL); return cb(false); }
    cb(true);
  });
}
app.on('web-contents-created', (e, wc) => {
  if (wc.getType() === 'webview') {
    wc.setWindowOpenHandler(({ url }) => { if (/^nxm:\/\//i.test(url)) sendToWindow('open-arg', url); else wc.loadURL(url).catch(() => {}); return { action: 'deny' }; });
    wc.on('will-navigate', (ev, url) => { if (/^nxm:\/\//i.test(url)) { ev.preventDefault(); sendToWindow('open-arg', url); } });
  }
  wc.on('will-attach-webview', (ev, prefs, params) => { delete prefs.preload; prefs.nodeIntegration = false; prefs.contextIsolation = true; params.partition = 'persist:mods'; });
});

// ---------------------------------------------------------------- the window
function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 1000, minHeight: 660, backgroundColor: '#111214', title: APP_NAME, show: false,
    icon: path.join(__dirname, '..', 'dist', 'favicon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, webviewTag: true, sandbox: true, spellcheck: false },
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => { win.show(); if (process.env.LCML_TEST) require(process.env.LCML_TEST)(win, { callEngine }); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (ev, url) => { if (!url.startsWith('file:')) ev.preventDefault(); });
  win.webContents.on('before-input-event', (ev, input) => { if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && lc(input.key) === 'i'))) win.webContents.toggleDevTools(); });
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}
const lc = (s) => String(s || '').toLowerCase();

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('lcml', (req) => {
    // lcml://local/<encoded full path>
    const u = new URL(req.url); const file = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    return net.fetch(pathToFileURL(file).toString(), { headers: req.headers });
  });
  startEngine();
  hookBrowserSession();
  try { updateOldLaunchers(); } catch (e) { /* */ }
  createWindow();
});
app.on('before-quit', () => { app.isQuitting = true; try { engine && engine.kill(); } catch (e) { /* */ } });
app.on('window-all-closed', () => app.quit());
