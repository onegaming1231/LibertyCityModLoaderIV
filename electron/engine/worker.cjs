'use strict';
// The engine runs here, in its own background process, so the window never freezes while files are copied.
// Messages: { t:'call', id, fn, args } from the app -> { t:'result', id, ok, value | error }
//           engine -> app: { t:'status' }, { t:'host', id, kind, args } (asks the window something) -> { t:'host-reply', id, value }
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const C = require('./core.cjs');
const P = require('./plan.cjs');
const X = require('./features.cjs');
const { E } = C;

const port = process.parentPort || null;
const send = (msg) => { if (port) port.postMessage(msg); else if (process.send) process.send(msg); };
const pending = new Map(); let hostId = 0;
function hostCall(kind, args) {
  return new Promise((resolve) => { const id = ++hostId; pending.set(id, resolve); send({ t: 'host', id, kind, args }); });
}
E.host.status = (text, color) => send({ t: 'status', text, color });
E.host.ask = (message, title, buttons) => hostCall('ask', { message, title, buttons });
E.host.image = (op, args) => hostCall('image', { op, args });
E.host.trash = (p) => { send({ t: 'trash', path: p }); };
E.host.secret = (op, value) => hostCall('secret', { op, value });
E.host.open = (url) => hostCall('open', { url });

// ---------------------------------------------------------------- finding the game
function regValue(key, name) {
  try {
    const out = cp.execFileSync('reg', ['query', key, '/v', name], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+REG_\\w+\\s+(.*)', 'i').exec(out);
    return m ? m[1].trim() : null;
  } catch (e) { return null; }
}
function findGame() {
  const cands = [];
  if (process.platform === 'win32') {
    let steam = regValue('HKCU\\Software\\Valve\\Steam', 'SteamPath');
    if (steam) {
      steam = steam.replace(/\//g, '\\');
      cands.push(path.join(steam, 'steamapps', 'common', 'Grand Theft Auto IV', 'GTAIV'));
      const vdf = path.join(steam, 'steamapps', 'libraryfolders.vdf');
      try { const t = fs.readFileSync(vdf, 'utf8'); for (const m of t.matchAll(/"path"\s+"([^"]+)"/g)) cands.push(path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps', 'common', 'Grand Theft Auto IV', 'GTAIV')); } catch (e) { /* */ }
    }
    cands.push('C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grand Theft Auto IV\\GTAIV', 'C:\\Program Files (x86)\\Rockstar Games\\Grand Theft Auto IV');
  }
  for (const c of cands) if (C.isFile(path.join(c, 'GTAIV.exe'))) return c;
  return '';
}
function downloadsFolder() {
  if (process.platform === 'win32') {
    const v = regValue('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders', '{374DE290-123F-4565-9164-39C4925E467B}');
    if (v) return v.replace(/%([^%]+)%/g, (a, n) => process.env[n] || a);
  }
  return path.join(require('os').homedir(), 'Downloads');
}

// ---------------------------------------------------------------- start: pick the game folder, tidy older installs, put back missing files
let plans = new Map(), planId = 0;
function openGame(p) {
  if (!p || !C.isFile(path.join(C.toOs(p), 'GTAIV.exe'))) { C.setGame(''); return { ok: false }; }
  C.setGame(p); P.resetIndexes();
  C.rm(C.J(C.dataDir(), 'temp'));
  try { C.convertToLibrary(); } catch (e) { C.appendLog('errors.log', 'library: ' + e.message); }
  let repaired = 0; try { repaired = C.repairImgArchives(); } catch (e) { /* */ }
  for (const fn of [C.renameOldImgs, C.moveDataFiles, C.moveKeyedData]) { try { fn(); } catch (e) { C.appendLog('errors.log', e.message); } }
  try { const mm = C.loadDb().filter(C.inLib); if (mm.length) C.syncFiles(C.allModFiles(mm), C.loadDb()); } catch (e) { C.appendLog('errors.log', 'sync: ' + e.message); }
  try { C.updateArchivesIfStale(); } catch (e) { /* */ }
  return { ok: true, game: E.game, repaired };
}
// a plan keeps its rows here; the window gets a copy with an id
function keepPlan(plan) { const id = 'p' + (++planId); plans.set(id, plan); return Object.assign({ id }, plan); }

const API = {
  findGame, downloadsFolder,
  openGame,
  game: () => E.game,
  myMods: X.myMods,
  // install
  loadMod: (p) => keepPlan(P.loadMod(p)),
  planFromRows: (plan) => keepPlan(plan),
  setPlanName: (id, name) => { const p = plans.get(id); if (p) p.modName = name; return true; },
  setPlanSource: (id, source) => { const p = plans.get(id); if (p) p.source = source; return true; },
  chooseRowFolder: (id, index, folder) => { const p = plans.get(id); return P.chooseRowFolder(p.rows[index], folder); },
  includeRow: (id, index) => { const p = plans.get(id); const r = p.rows[index]; return r; },
  cancelPlan: (id) => { const p = plans.get(id); if (p && p.temp) C.rm(p.temp); plans.delete(id); return true; },
  install: async (id, opts) => { const p = plans.get(id); if (!p) throw new Error('Nothing to install.'); const r = await P.installPlan(p, opts); if (r.ok) plans.delete(id); return r; },
  // my mods
  setModOn: async (name, on) => { if (on) return P.enableMod(name); P.disableMod(name); return true; },
  uninstall: (name) => P.uninstallMod(name),
  moveMod: (name, to) => P.moveModOrder(name, to),
  renameMod: (a, b) => P.renameMod(a, b),
  setModsState: (names, on) => P.setModsState(names, on),
  conflictCheck: X.conflictCheck,
  // trouble
  tsState: X.tsState, startNoMods: X.startNoMods, stopTroubleshoot: X.stopTroubleshoot, startFindBroken: X.startFindBroken, answerFindBroken: X.answerFindBroken,
  // other mods
  findExternalMods: X.findExternalMods, addFoundMods: X.addFoundMods, clearFound: X.clearFound, tidyFoundMods: X.tidyFoundMods,
  // clean up
  findLeftovers: X.findLeftovers, cleanLeftovers: X.cleanLeftovers,
  // archives and textures
  listArchives: X.listArchives, archiveFiles: X.archiveFiles, findInGameArchives: X.findInGameArchives, takeOut: X.takeOut,
  replacePlan: (src, t) => keepPlan(X.replacePlan(src, t)), addFilesPlan: (a, f, files) => keepPlan(X.addFilesPlan(a, f, files)),
  openModel: X.openModel, openTextures: X.openTextures, texturePixels: X.texturePixels, replaceTexture: X.replaceTexture, textureLevels: X.textureLevels,
  finishTextures: (id, save) => { const r = X.finishTextures(id, save); if (r && r.plan) r.plan = keepPlan(r.plan); return r; }, closeTextures: X.closeTextures,
  // sharing
  exportModList: X.exportModList, importModList: X.importModList,
  // nexus and downloads
  // the window never sees or changes the saved Nexus login
  settings: () => { const s = X.loadSettings(); delete s.NexusLogin; return s; },
  saveSettings: (s) => { const cur = X.loadSettings(); const x = Object.assign({}, s); delete x.NexusLogin; delete x.NexusKey; delete x.NexusKeyV2; X.saveSettings(Object.assign(cur, x)); return true; },
  nexusLogin: X.nexusLogin, nexusLoginCancel: X.nexusLoginCancel, nexusLogout: X.nexusLogout, nexusAccount: X.nexusAccount, nxmToDownload: X.nxmToDownload, nexusPageToDownload: X.nexusPageToDownload,
  checkUpdates: () => X.checkUpdates(downloadsFolder()), updateDownload: X.updateDownload, download: X.download,
  nexusFromName: (n) => P.nexusFromName(n),
  // essentials
  essentials: X.essentials, ffIniValue: X.ffIniValue, setFFIniValue: X.setFFIniValue, bumpVehicleBudget: X.bumpVehicleBudget,
  storage: X.storage, clearDownloads: X.clearDownloads, find7z: () => P.find7z(),
  dataDir: () => (E.game ? C.dataDir() : ''),
};

async function onMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.t === 'host-reply') { const r = pending.get(msg.id); if (r) { pending.delete(msg.id); r(msg.value); } return; }
  if (msg.t !== 'call') return;
  const fn = API[msg.fn];
  try {
    if (!fn) throw new Error('Unknown action: ' + msg.fn);
    const value = await fn(...(msg.args || []));
    send({ t: 'result', id: msg.id, ok: true, value });
  } catch (e) {
    try { if (E.game) C.appendLog('errors.log', msg.fn + ': ' + (e.stack || e.message)); } catch (x) { /* */ }
    send({ t: 'result', id: msg.id, ok: false, error: e && e.message ? e.message : String(e), friendly: !!(e && e.friendly) });
  }
}
if (port) port.on('message', (e) => onMessage(e.data));
else process.on('message', onMessage);

module.exports = { API };
