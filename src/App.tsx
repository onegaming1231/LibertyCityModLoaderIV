import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { L, call, ModRow, Plan, Essentials, baseName } from './api';
import { thumb } from './imageOps';
import { Header } from './components/Header';
import { Sidebar, Page } from './components/Sidebar';
import { Background, Look, defaultLook } from './components/Background';
import { StatusBar } from './components/StatusBar';
import { AskDialog, AskReq } from './components/AskDialog';
import { MyMods } from './pages/MyMods';
import { Install } from './pages/Install';
import { GetMods } from './pages/GetMods';
import { Archives } from './pages/Archives';
import { Settings } from './pages/Settings';

interface AppCtx {
  game: string; mods: ModRow[]; ess: Essentials | null; page: Page; busy: boolean; look: Look;
  setPage: (p: Page) => void;
  status: (text: string, color?: string) => void;
  ask: (message: string, title: string, buttons: string[]) => Promise<string>;
  run: <T>(fn: () => Promise<T>, busyText?: string) => Promise<T | undefined>;
  refresh: () => Promise<void>;
  setGame: (p: string) => Promise<boolean>;
  loadMod: (p: string, name?: string, source?: any) => Promise<void>;
  plan: Plan | null; setPlan: (p: Plan | null) => void;
  browse: (url: string) => void; browserUrl: { url: string; n: number } | null;
  startDownload: (d: { url: string; fileName: string; modName: string; source?: any }) => Promise<void>;
  handleLink: (url: string) => Promise<void>;
  saveLook: (l: Look) => void;
  updateQueue: React.MutableRefObject<string[]>;
  nextUpdate: () => Promise<void>;
}
const Ctx = createContext<AppCtx>(null as any);
export const useApp = () => useContext(Ctx);

const TAGLINES = [
  'Welcome to Liberty City. The land of opportunity.', 'Cousin! Your mods have arrived!', 'Weazel News: Local man installs mods. City unharmed.',
  'Brucie approved. This loader is fully alpha.', "Grab a Cluckin' Bell bucket while the files copy.", 'Sprunk: the official drink of mod installing.',
  'LCPD reminds you: back up your saves.', 'Take the Algonquin Bridge. Skip the scenic route.', 'Packie says: clean job, no loose ends.',
  'Now broadcasting live from Star Junction.', 'From the docks of Broker to the hills of Alderney.', 'Another shipment through the Port of Liberty.',
];

export default function App() {
  const [game, setGameState] = useState('');
  const [mods, setMods] = useState<ModRow[]>([]);
  const [ess, setEss] = useState<Essentials | null>(null);
  const [page, setPage] = useState<Page>('my-mods');
  const [statusLine, setStatusLine] = useState<{ text: string; color: string }>({ text: 'Starting...', color: 'dim' });
  const [tagline, setTagline] = useState(TAGLINES[0]);
  const [busy, setBusy] = useState(false);
  const [asks, setAsks] = useState<AskReq[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [browserUrl, setBrowserUrl] = useState<{ url: string; n: number } | null>(null);
  const [look, setLook] = useState<Look>(defaultLook);
  const updateQueue = useRef<string[]>([]);
  const gameRef = useRef(''); gameRef.current = game;

  const status = useCallback((text: string, color = 'text') => {
    setStatusLine({ text, color });
    if (color !== 'text') setTagline(TAGLINES[Math.floor(Math.random() * TAGLINES.length)]);
  }, []);
  const ask = useCallback((message: string, title: string, buttons: string[]) => new Promise<string>((resolve) => {
    setAsks((a) => [...a, { message, title, buttons, resolve }]);
  }), []);
  const refresh = useCallback(async () => {
    if (!gameRef.current) { setMods([]); setEss(null); return; }
    try { setMods(await call('myMods')); setEss(await call('essentials')); } catch (e: any) { status(e.message, 'red'); }
  }, [status]);
  const run = useCallback(async <T,>(fn: () => Promise<T>, busyText?: string): Promise<T | undefined> => {
    setBusy(true); if (busyText) status(busyText, 'dim');
    try { return await fn(); }
    catch (e: any) { status(e.friendly ? e.message : "That didn't work: " + e.message, 'red'); return undefined; }
    finally { setBusy(false); }
  }, [status]);

  const saveLook = useCallback((l: Look) => { setLook(l); L.look.set(l); }, []);
  const setGame = useCallback(async (p: string) => {
    const r = await run(() => call<{ ok: boolean; repaired: number }>('openGame', p), 'Opening your game folder...');
    if (!r || !r.ok) { status("That folder doesn't have GTAIV.exe. Pick the folder that has it.", 'red'); return false; }
    setGameState(p); gameRef.current = p;
    const l = Object.assign({}, look, { game: p }); saveLook(l);
    await refresh();
    status(r.repaired ? 'Repaired ' + r.repaired + " model file(s) packed by an older version - the 'Invalid resource' crash should be gone." : 'Ready. Your game folder is set.', 'green');
    try { const s = await call('settings'); if (s.WatchDownloads !== false) L.watch(true); } catch (e) { /* */ }
    return true;
  }, [run, status, refresh, look, saveLook]);

  const loadMod = useCallback(async (p: string, name?: string, source?: any) => {
    if (!gameRef.current) { setPage('settings'); status('Pick your GTA IV folder first.', 'red'); return; }
    setPage('install');
    if (plan) await call('cancelPlan', plan.id).catch(() => {});
    setPlan(null);
    const pl = await run(() => call<Plan>('loadMod', p), 'Unloading the shipment at the docks...');
    if (!pl) return;
    if (name && !pl.source) pl.modName = name.replace(/[^A-Za-z0-9 _\-.]/g, '').replace(/\s+/g, ' ').trim() || pl.modName;
    if (source) {
      pl.source = source; await call('setPlanSource', pl.id, source);
      // a newer version of a mod you have keeps its name, so it replaces the old one
      const have = mods.find((m) => m.nexusId && m.nexusId === String(source.NexusId || ''));
      if (have) pl.modName = have.name; else if (name) pl.modName = name.replace(/[^A-Za-z0-9 _\-.]/g, '').replace(/\s+/g, ' ').trim() || pl.modName;
    }
    await call('setPlanName', pl.id, pl.modName);
    setPlan(pl);
    const ready = pl.rows.filter((r) => r.Dest && !['SKIP', 'MANUAL', 'PREVIEW'].includes(r.Kind)).length;
    status('Ready to install ' + ready + ' file(s). Check the list, then press Install.', 'green');
  }, [plan, run, status, mods]);

  const startDownload = useCallback(async (d: { url: string; fileName: string; modName: string; source?: any }) => {
    const p = await run(() => call<string>('download', d.url, d.fileName, d.modName), 'Shipment ordered. Downloading...');
    if (p) await loadMod(p, d.modName, d.source);
  }, [run, loadMod]);
  const browse = useCallback((url: string) => {
    if (!gameRef.current) { setPage('settings'); status('Pick your GTA IV folder first.', 'red'); return; }
    if (!/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;
    setBrowserUrl({ url, n: Date.now() }); setPage('get-mods');
  }, [status]);
  const handleLink = useCallback(async (url: string) => {
    url = url.trim(); if (!url) return;
    if (/^nxm:\/\//i.test(url)) { const d = await run(() => call('nxmToDownload', url)); if (d) await startDownload(d); return; }
    if (/^https?:\/\/.+\.(zip|rar|7z|oiv)(\?.*)?$/i.test(url)) { await startDownload({ url, fileName: baseName(new URL(url).pathname), modName: '' }); return; }
    if (/nexusmods\.com\/.+\/mods\/\d+/i.test(url)) {
      const acc = await call('nexusAccount').catch(() => ({ connected: false }));
      if (acc.connected) { const r = await run(() => call('nexusPageToDownload', url)); if (r && r.download) { await startDownload(r.download); return; } if (r && r.browse) { browse(r.browse); return; } }
    }
    browse(url);
  }, [run, startDownload, browse]);
  const nextUpdate = useCallback(async () => {
    const q = updateQueue.current; if (!q.length) return;
    const name = q.shift()!;
    const r = await run(() => call('updateDownload', name));
    if (!r) { await nextUpdate(); return; }
    if (r.browse) { updateQueue.current = []; browse(r.browse); return; }
    if (r.download) await startDownload(r.download);
  }, [run, browse, startDownload]);

  // ---- start
  useEffect(() => {
    const offs = [
      L.onStatus((t, c) => status(t, c)),
      L.onHost(async (id, kind, args) => {
        if (kind === 'ask') { const v = await ask(args.message, args.title, args.buttons || ['OK']); L.hostReply(id, v); return; }
        if (kind === 'image' && args.op === 'thumb') { try { L.hostReply(id, await thumb(args.args.bytes)); } catch (e) { L.hostReply(id, null); } return; }
        L.hostReply(id, null);
      }),
    ];
    (async () => {
      const lk = Object.assign({}, defaultLook, await L.look.get().catch(() => ({})));
      setLook(lk);
      let g = lk.game && (await L.file.exists(lk.game + '/GTAIV.exe').catch(() => false)) ? lk.game : '';
      if (!g) g = await call<string>('findGame').catch(() => '');
      if (g) { const ok = await setGameInner(g, lk); if (!ok) g = ''; }
      if (!g) { setPage('settings'); status("Couldn't find GTA IV. Press Change and pick the folder with GTAIV.exe.", 'amber'); }
      const info = await L.info();
      if (info.arg) openArg(info.arg);
    })();
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // first start: the game folder from last time (no look save loop)
  async function setGameInner(p: string, lk: Look) {
    const r = await call<{ ok: boolean; repaired: number }>('openGame', p).catch(() => null);
    if (!r || !r.ok) return false;
    setGameState(p); gameRef.current = p;
    if (lk.game !== p) { const l = Object.assign({}, lk, { game: p }); setLook(l); L.look.set(l); }
    await refresh();
    status(r.repaired ? 'Repaired ' + r.repaired + ' model file(s) packed by an older version.' : 'Ready. Pick a mod site, or drop a mod on Install.', 'green');
    try { const s = await call('settings'); if (s.WatchDownloads !== false) L.watch(true); } catch (e) { /* */ }
    return true;
  }
  const openArgRef = useRef<(a: string) => void>(() => {});
  function openArg(a: string) { openArgRef.current(a); }
  openArgRef.current = (a: string) => { if (/^nxm:\/\//i.test(a)) handleLink(a); else if (/\.lcmods$/i.test(a)) { setPage('my-mods'); run(() => call('importModList', a)).then(refresh); } else loadMod(a); };
  useEffect(() => {
    const offs = [
      L.onOpenArg((a) => openArgRef.current(a)),
      L.onDownloaded(({ path, title }) => {
        let n = title.replace(/\s+at Grand Theft Auto IV Nexus.*$/i, '').replace(/\s+for GTA 4\s*$/i, '').replace(/\s*[-|:]\s*(LibertyCity|GTAinside|ModDB|GTAForums|GTA4-Mods).*$/i, '').replace(/^GTA 4\s+/i, '');
        const nx = /-(\d{1,6})-\d+/.test(baseName(path));
        loadMod(path, nx ? undefined : n);
      }),
      L.onDownloadLanded(async (p) => {
        const r = await ask('A new mod just landed in your Downloads:\n\n' + baseName(p) + '\n\nOpen it in Install?', 'New download', ['Yes', 'No']);
        if (r === 'Yes') loadMod(p);
      }),
      L.onLiveWallpaper(async (p) => {
        const r = await ask("Use this video as the background for all pages?\n\nIt plays with no sound and loops. Change 'Darkness' in Settings > Look if text is hard to read.", 'Live wallpaper', ['Yes', 'No']);
        if (r === 'Yes') { saveLook(Object.assign({}, look, { image: p, noDefault: false })); status('Live wallpaper set.', 'green'); }
        else status('Not used.', 'dim');
      }),
    ];
    return () => offs.forEach((o) => o());
  }, [loadMod, ask, look, saveLook]);

  // a file dropped anywhere on the window
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length || (e as any).handledByPage) return;
      e.preventDefault();
      const p = L.pathOf(e.dataTransfer.files[0]);
      if (p) openArgRef.current(p);
    };
    window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, []);

  const ctx: AppCtx = { game, mods, ess, page, busy, look, setPage, status, ask, run, refresh, setGame, loadMod, plan, setPlan, browse, browserUrl, startDownload, handleLink, saveLook, updateQueue, nextUpdate };
  const anyAsk = asks[0];
  return (
    <Ctx.Provider value={ctx}>
      <div className="relative h-screen flex flex-col bg-[#111214] text-[#e6e6e6] overflow-hidden">
        <Background look={look} />
        <Header tagline={tagline} />
        <div className="relative z-10 flex flex-1 min-h-0">
          <Sidebar />
          <main className="flex-1 min-w-0 min-h-0 relative">
            <div className={page === 'get-mods' ? 'h-full' : 'hidden'}><GetMods /></div>
            {page === 'my-mods' && <MyMods />}
            {page === 'install' && <Install />}
            {page === 'archives' && <Archives />}
            {page === 'settings' && <Settings />}
          </main>
        </div>
        <StatusBar text={statusLine.text} color={statusLine.color} busy={busy} />
        {anyAsk && <AskDialog req={anyAsk} onDone={(v) => { anyAsk.resolve(v); setAsks((a) => a.slice(1)); }} />}
      </div>
    </Ctx.Provider>
  );
}
