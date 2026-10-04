'use strict';
// The bridge between the window and the app. The window can only use what's listed here.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (ch) => (cb) => { const l = (e, ...a) => cb(...a); ipcRenderer.on(ch, l); return () => ipcRenderer.removeListener(ch, l); };

contextBridge.exposeInMainWorld('lcml', {
  isApp: true,
  pathOf: (file) => { try { return webUtils.getPathForFile(file); } catch (e) { return ''; } },
  call: (fn, ...args) => ipcRenderer.invoke('engine', fn, args),
  onStatus: on('status'),
  onHost: on('host'),
  hostReply: (id, value) => ipcRenderer.send('host-reply', id, value),
  onOpenArg: on('open-arg'),
  onDownloaded: on('downloaded'),
  onDownloadLanded: on('download-landed'),
  onLiveWallpaper: on('live-wallpaper'),
  look: { get: () => ipcRenderer.invoke('look:get'), set: (o) => ipcRenderer.invoke('look:set', o), import: (f) => ipcRenderer.invoke('look:import', f) },
  dialog: { open: (o) => ipcRenderer.invoke('dlg:open', o || {}), save: (o) => ipcRenderer.invoke('dlg:save', o || {}) },
  shell: { external: (u) => ipcRenderer.invoke('shell:external', u), open: (p) => ipcRenderer.invoke('shell:open', p), show: (p) => ipcRenderer.invoke('shell:show', p) },
  file: { writePng: (p, b64) => ipcRenderer.invoke('file:writePng', p, b64), read: (p) => ipcRenderer.invoke('file:read', p), exists: (p) => ipcRenderer.invoke('file:exists', p) },
  info: () => ipcRenderer.invoke('app:info'),
  launchGame: (dir) => ipcRenderer.invoke('game:launch', dir),
  reg: { menu: (on) => ipcRenderer.invoke('reg:menu', on), menuState: () => ipcRenderer.invoke('reg:menuState'), nxm: (on) => ipcRenderer.invoke('reg:nxm', on), nxmState: () => ipcRenderer.invoke('reg:nxmState') },
  watch: (on) => ipcRenderer.invoke('watch:set', on),
  music: { list: (folder) => ipcRenderer.invoke('music:list', folder), ytm: (base, token, method, p, body) => ipcRenderer.invoke('ytm', base, token, method, p, body) },
});
