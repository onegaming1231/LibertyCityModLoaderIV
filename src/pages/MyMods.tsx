import React, { useEffect, useMemo, useState } from 'react';
import { Layers, Search, GripVertical, ShieldAlert, RefreshCw, Share2, Sparkles, Trash2, FolderSearch, ArrowDownToLine, Info, Bug, Gamepad2 } from 'lucide-react';
import { useApp } from '../App';
import { call, L, ModRow } from '../api';
import { Btn, Card, PageTitle, Tick, Pill } from '../ui';
import { ModDetail } from '../modals/ModDetail';
import { Conflicts } from '../modals/Conflicts';
import { FoundMods } from '../modals/FoundMods';
import { CleanUp } from '../modals/CleanUp';

let foundCache: any[] | null = null;
let foundHidden = false;

export const MyMods: React.FC = () => {
  const { mods, game, run, refresh, status, ask, startDownload, updateQueue, nextUpdate } = useApp();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'on' | 'off'>('all');
  const [detail, setDetail] = useState<ModRow | null>(null);
  const [conflicts, setConflicts] = useState<any[] | null>(null);
  const [found, setFound] = useState<any[]>(foundCache || []);
  const [showFound, setShowFound] = useState(false);
  const [leftovers, setLeftovers] = useState<any[] | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number>(-1);
  const [ts, setTs] = useState<any>(null);
  const [hidden, setHidden] = useState(foundHidden);

  const scanFound = async () => { try { const f = await call<any[]>('findExternalMods'); foundCache = f; setFound(f); } catch (e) { /* */ } };
  useEffect(() => { if (game && !foundCache) scanFound(); if (game) call('tsState').then(setTs).catch(() => {}); /* eslint-disable-next-line */ }, [game]);
  useEffect(() => { if (game) call('tsState').then(setTs).catch(() => {}); }, [mods, game]);

  const shown = useMemo(() => mods.filter((m) => (filter === 'all' || (filter === 'on' ? m.on : !m.on)) && m.name.toLowerCase().includes(q.toLowerCase())), [mods, q, filter]);

  async function toggle(m: ModRow) {
    await run(() => call('setModOn', m.name, !m.on), (m.on ? 'Turning off ' : 'Turning on ') + m.name + '...');
    await refresh();
  }
  async function dropTo(at: number) {
    const name = drag; setDrag(null); setDropAt(-1);
    if (!name) return;
    await run(() => call('moveMod', name, at), "Putting '" + name + "' in its new place...");
    await refresh();
  }
  async function checkConflicts() { const r = await run(() => call<any[]>('conflictCheck'), 'Checking your mods...'); if (r) setConflicts(r); }
  async function updates() {
    const r = await run(() => call('checkUpdates'), 'Checking for updates...');
    if (!r) return;
    if (r.needKey) { await ask('To check for updates, add your free Nexus Mods API key first (Settings > Nexus Mods account).', 'Updates', ['OK']); return; }
    if (r.none) { await ask("None of your mods are linked to Nexus yet.\n\nMods you download through the app (or with Nexus' 'Mod Manager Download' button) are linked by themselves. Then they can be checked for updates.", 'Updates', ['OK']); return; }
    await refresh();
    if (!r.found.length) return;
    const lines = r.found.map((f: any) => '- ' + f.name + ':  ' + f.from + '  ->  ' + f.to).join('\n');
    const a = await ask('Updates found:\n\n' + lines + '\n\nUpdate them now? Each one opens in Install. Check it and press Install.', 'Updates', ['Yes', 'No']);
    if (a === 'Yes') { updateQueue.current = r.found.map((f: any) => f.name); await nextUpdate(); }
  }
  async function share() {
    const a = await ask('Save your mod list to a file you can send to a friend, or open a list a friend sent you?', 'Share', ['Save My List', 'Open a List', 'Cancel']);
    if (a === 'Save My List') {
      const p = await L.dialog.save({ title: 'Save your mod list', defaultPath: 'My GTA IV mods.lcmods', filters: [{ name: 'Mod list', extensions: ['lcmods'] }] });
      if (p) await run(() => call('exportModList', p));
    } else if (a === 'Open a List') {
      const p = await L.dialog.open({ title: 'Open a mod list', filters: [{ name: 'Mod list', extensions: ['lcmods'] }, { name: 'All files', extensions: ['*'] }] });
      if (!p) return;
      const r = await run(() => call('importModList', p));
      if (r && r.open) for (const u of r.open) L.shell.external(u);
      await refresh();
    }
  }
  async function refreshAll() {
    const changes = await run(() => call<string[]>('tidyFoundMods', true), 'Checking your game folder...');
    await refresh(); foundHidden = false; setHidden(false); await scanFound();
    if (changes && changes.length) await ask('I tidied your mod list:\n\n' + changes.slice(0, 15).map((c) => '-  ' + c).join('\n') + (changes.length > 15 ? '\n...and ' + (changes.length - 15) + ' more' : '') + '\n\nNothing was moved or deleted. Only the list changed.', 'My Mods', ['OK']);
    else status('Refreshed. Your list is up to date.', 'green');
  }
  async function cleanUp() {
    const r = await run(() => call<any[]>('findLeftovers'), 'Scanning your game folder for leftovers...');
    if (!r) return;
    if (!r.length) { status('All clean - no leftovers found.', 'green'); await ask('All clean. No leftover files found.', 'Clean Up', ['OK']); return; }
    status('Found ' + r.length + ' kind(s) of leftovers. Tick what to clean.', 'amber');
    setLeftovers(r);
  }
  // ---- something wrong in the game?
  async function tsA() {
    if (!ts) await run(() => call('startNoMods'), 'Turning your mods off...');
    else if (ts.mode === 'nomods') await run(() => call('stopTroubleshoot'));
    else await run(() => call('answerFindBroken', true), 'Changing which mods are on...');
    await refresh(); setTs(await call('tsState').catch(() => null));
  }
  async function tsB() {
    if (!ts) {
      const a = await ask("The app will turn your mods off and on in groups. After each change, start the game, check if the problem is still there, close the game and press the answer here.\n\nFusion Fix stays on. When the broken mod is found, all your other mods go back on.\n\nStart?", 'Find the Broken Mod', ['Yes', 'No']);
      if (a !== 'Yes') return;
      await run(() => call('startFindBroken'), 'Turning your mods off for the first test...');
      status('Test 1: all your mods are off (Fusion Fix stays on). Start the game. Is the problem still there?', 'amber');
    } else if (ts.mode === 'find') await run(() => call('answerFindBroken', false), 'Changing which mods are on...');
    await refresh(); setTs(await call('tsState').catch(() => null));
  }
  async function tsStop() { await run(() => call('stopTroubleshoot'), 'Turning your mods back on...'); await refresh(); setTs(null); }

  const foundNames = found.slice(0, 4).map((f) => f.Label).join(', ') + (found.length > 4 ? ', ...' : '');
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto p-5 space-y-4 pb-28">
        <PageTitle icon={<Layers className="w-6 h-6" />} title="My Mods" sub="Tick = on or off. Drag a mod up or down: the mod lower in the list wins when two mods change the same file."
          right={<>
            <Btn icon={<ShieldAlert className="w-4 h-4" />} onClick={checkConflicts} disabled={!game}>Check for Conflicts</Btn>
            <Btn icon={<ArrowDownToLine className="w-4 h-4" />} onClick={updates} disabled={!game}>Updates</Btn>
            <Btn icon={<Share2 className="w-4 h-4" />} onClick={share} disabled={!game}>Share</Btn>
            <Btn icon={<FolderSearch className="w-4 h-4" />} onClick={async () => { await run(scanFound, 'Checking your game folder...'); if (!foundCache || !foundCache.length) status('No other mods found. Everything in your game folder is managed here.', 'green'); else setShowFound(true); }} disabled={!game}>Find Other Mods</Btn>
            <Btn icon={<Sparkles className="w-4 h-4" />} onClick={cleanUp} disabled={!game}>Clean Up</Btn>
            <Btn icon={<RefreshCw className="w-4 h-4" />} onClick={refreshAll} disabled={!game}>Refresh</Btn>
          </>} />

        {found.length > 0 && !hidden && (
          <div className="rounded-xl border border-amber-500/50 bg-[#2a2519]/92 backdrop-blur-md px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[14px] text-zinc-200 leading-snug min-w-0">
              <div className="font-semibold text-amber-200">Found {found.length} mod{found.length !== 1 ? 's' : ''} installed without this app: <span className="font-normal text-zinc-200">{foundNames}</span></div>
              <div className="text-[13px] text-zinc-400 mt-0.5">Add them to manage them here too (turn on or off, uninstall).</div>
            </div>
            <div className="flex gap-2"><Btn kind="amber" onClick={() => setShowFound(true)}>Review</Btn><Btn onClick={() => { foundHidden = true; setHidden(true); }}>Hide</Btn></div>
          </div>
        )}

        <Card className="p-3.5 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your mods..." className="w-full bg-[#111214] border border-[#363a44] rounded-lg pl-9 pr-3 py-2 text-[14px] text-zinc-100 outline-none focus:border-[#6ca4d8]" />
          </div>
          <div className="flex gap-1 bg-[#111214] p-1 rounded-lg border border-[#363a44]">
            {(['all', 'on', 'off'] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`px-3.5 py-1.5 rounded text-[13px] font-semibold ${filter === f ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}>{f === 'all' ? 'All' : f === 'on' ? 'On' : 'Off'}</button>)}
          </div>
          <Btn icon={<Gamepad2 className="w-4 h-4" />} onClick={() => game && L.shell.open(game)} disabled={!game}>Open Game Folder</Btn>
        </Card>

        <Card className="overflow-hidden">
          <div className="grid grid-cols-[34px_34px_64px_minmax(200px,1fr)_92px_150px_70px_92px_130px_52px] items-center gap-2 px-4 py-2.5 border-b border-[#363a44] text-[12px] font-bold uppercase tracking-wider text-zinc-400 font-barlow-condensed">
            <span /><span>On</span><span /><span>Mod</span><span>Status</span><span>Installed</span><span className="text-center">Files</span><span className="text-center">Replaced</span><span>Version</span><span />
          </div>
          {!game && <div className="px-5 py-10 text-center text-zinc-400 text-[14px]">Pick your GTA IV folder in Settings first.</div>}
          {game && mods.length === 0 && <div className="px-5 py-10 text-center text-zinc-400 text-[14px]">No mods here yet. Head to Get Mods, or press Find Other Mods.</div>}
          {shown.map((m) => {
            const idx = mods.indexOf(m);
            const st = m.missing > 0 ? { t: 'Missing', c: 'text-amber-300' } : m.on ? { t: 'On', c: 'text-emerald-400' } : { t: 'Off', c: 'text-zinc-500' };
            return (
              <div key={m.name}
                onDragOver={(e) => { if (!drag) return; e.preventDefault(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setDropAt(idx + (e.clientY > r.top + r.height / 2 ? 1 : 0)); }}
                onDrop={(e) => { if (drag) { e.preventDefault(); e.stopPropagation(); dropTo(dropAt); } }}
                className={`relative grid grid-cols-[34px_34px_64px_minmax(200px,1fr)_92px_150px_70px_92px_130px_52px] items-center gap-2 px-4 py-2 border-b border-[#2a2d34] hover:bg-white/[0.03] ${drag === m.name ? 'opacity-40' : ''} ${m.on ? '' : 'opacity-75'}`}>
                {drag && dropAt === idx && <div className="absolute left-0 right-0 top-0 h-[3px] bg-[#6ca4d8]" />}
                {drag && dropAt === idx + 1 && idx === mods.length - 1 && <div className="absolute left-0 right-0 bottom-0 h-[3px] bg-[#6ca4d8]" />}
                <span draggable={!q && filter === 'all'} onDragStart={(e) => { setDrag(m.name); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', m.name); }} onDragEnd={() => { setDrag(null); setDropAt(-1); }}
                  className={`text-zinc-500 ${!q && filter === 'all' ? 'cursor-grab hover:text-zinc-200' : 'opacity-30'}`} title="Drag up or down"><GripVertical className="w-4 h-4" /></span>
                <Tick on={m.on} onClick={() => toggle(m)} title={m.on ? 'Turn off' : 'Turn on'} />
                <div className="w-14 h-8 rounded overflow-hidden bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[13px] font-bold text-zinc-300">
                  {m.thumb ? <img src={m.thumb} className="w-full h-full object-cover" /> : m.name.slice(0, 1).toUpperCase()}
                </div>
                <button onClick={() => setDetail(m)} className="text-left min-w-0">
                  <div className="text-[14px] text-zinc-100 font-semibold truncate" title={m.name}>{m.name}</div>
                  {m.found && <div className="text-[11px] text-zinc-500">Found in your game folder</div>}
                </button>
                <span className={`text-[13px] font-semibold ${st.c}`}>{st.t}</span>
                <span className="text-[12px] font-mono text-zinc-400 truncate">{m.date}</span>
                <span className="text-[13px] text-zinc-300 text-center">{m.files}</span>
                <span className={`text-[13px] text-center ${m.replaced ? 'text-amber-300 font-semibold' : 'text-zinc-500'}`}>{m.replaced}</span>
                <span className="text-[12px] truncate">{m.update ? <span className="text-emerald-300 font-semibold">{(m.version || '?') + ' > ' + m.update}</span> : <span className="text-zinc-400 font-mono">{m.version || '-'}</span>}</span>
                <button onClick={() => setDetail(m)} className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800" title="Details"><Info className="w-4 h-4" /></button>
              </div>
            );
          })}
          {drag && <div onDragOver={(e) => { e.preventDefault(); setDropAt(mods.length); }} onDrop={(e) => { e.preventDefault(); dropTo(mods.length); }} className={`h-10 text-center text-[12px] text-zinc-500 leading-10 ${dropAt === mods.length ? 'bg-[#6ca4d8]/10' : ''}`}>Drop here to make it the lowest (it wins)</div>}
        </Card>
      </div>

      {/* something wrong in the game? */}
      <div className="absolute left-0 right-0 bottom-0 z-10 bg-[#16181c]/95 backdrop-blur-md border-t border-[#363a44] px-5 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className={`flex items-center gap-2 text-[14px] ${ts ? 'text-amber-200' : 'text-zinc-200'}`}>
          <Bug className="w-4 h-4 shrink-0" />
          {!ts ? 'Something wrong in the game?'
            : ts.mode === 'nomods' ? 'Your mods are off for testing (Fusion Fix stays on). Play, then turn them back on.'
            : ts.step === 0 ? 'Test 1: all ' + ts.off + ' mod(s) are off. Start the game. Is the problem still there?'
            : 'Test ' + (ts.step + 1) + ': ' + ts.off + ' mod(s) are off. Start the game. Is the problem still there?'}
        </div>
        <div className="flex gap-2">
          <Btn disabled={!game} onClick={tsA}>{!ts ? 'Play Without Mods' : ts.mode === 'nomods' ? 'Turn My Mods Back On' : 'Still There'}</Btn>
          {(!ts || ts.mode === 'find') && <Btn disabled={!game} kind={ts ? 'green' : 'normal'} onClick={tsB}>{!ts ? 'Find the Broken Mod' : "It's Gone"}</Btn>}
          {ts && ts.mode === 'find' && <Btn onClick={tsStop}>Stop</Btn>}
        </div>
      </div>

      {detail && <ModDetail mod={mods.find((x) => x.name === detail.name) || detail} onClose={() => setDetail(null)} />}
      {conflicts && <Conflicts rows={conflicts} onClose={() => setConflicts(null)} />}
      {showFound && <FoundMods found={found} onClose={async (changed) => { setShowFound(false); if (changed) { await refresh(); await scanFound(); } }} />}
      {leftovers && <CleanUp items={leftovers} onClose={async (r) => {
        setLeftovers(null); await refresh();
        if (r && r.reinstallFF) {
          const a = await ask('Now put back the normal Fusion Fix?\n\nThe latest Fusion Fix downloads and opens in Install. Then press Install (and Yes to replace it).', 'Clean Up', ['Yes', 'No']);
          if (a === 'Yes') await startDownload({ url: 'https://github.com/ThirteenAG/GTAIV.EFLC.FusionFix/releases/latest/download/GTAIV.EFLC.FusionFix.zip', fileName: 'GTAIV.EFLC.FusionFix.zip', modName: 'Fusion Fix' });
        }
      }} />}
    </div>
  );
};
