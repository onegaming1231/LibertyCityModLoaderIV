import React, { useEffect, useState } from 'react';
import { Archive, Search, Download, Replace, FilePlus2, Image as ImageIcon, FolderOpen, Box } from 'lucide-react';
import { useApp } from '../App';
import { call, L, baseName, Plan } from '../api';
import { Btn, Card, PageTitle } from '../ui';
import { Textures } from '../modals/Textures';
import { ModelViewer } from '../modals/ModelViewer';

const MODEL = /\.(wdr|wft|wdd)$/i;

const size = (b: number | null) => (b == null ? '' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B');
interface Item { archive: string; inner: string; name: string; folder: string; size: number | null; type: string }

// look inside the game's .img and .rpf files: take files out, replace one, add files, see and change textures
export const Archives: React.FC = () => {
  const { game, run, status, setPlan, setPage, ask } = useApp();
  const [archives, setArchives] = useState<{ rel: string; name: string; where: string }[]>([]);
  const [cur, setCur] = useState('');
  const [files, setFiles] = useState<Item[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [q, setQ] = useState('');
  const [info, setInfo] = useState('');
  const [searching, setSearching] = useState(false);
  const [tex, setTex] = useState<any>(null);
  const [model, setModel] = useState<any>(null);

  useEffect(() => { if (game) run(() => call('listArchives'), 'Opening your game archives...').then((a) => { if (a) { setArchives(a); status('Pick an archive on the left, or find a file by name.', 'dim'); } }); /* eslint-disable-next-line */ }, [game]);
  async function openArchive(rel: string) {
    setCur(rel); setSearching(false); setSel(new Set());
    try { const f = await call<Item[]>('archiveFiles', rel); setFiles(f); setInfo(baseName(rel) + ': ' + f.length + ' files'); }
    catch (e: any) { setFiles([]); setInfo("Can't open this one: " + e.message); }
  }
  async function find() {
    if (!q.trim()) return;
    const r = await run(() => call<Item[]>('findInGameArchives', q), "Searching (first time: reading what's inside your archives)...");
    if (!r) return;
    setFiles(r); setSearching(true); setSel(new Set());
    setInfo(r.length ? r.length + ' file(s) found' + (r.length >= 500 ? ' (first 500)' : '') : "No file named like '" + q + "' in your game archives.");
    status('', 'dim');
  }
  const picked = [...sel].map((i) => files[i]).filter(Boolean);
  function goInstall(p: Plan) { setPlan(p); setPage('install'); status('Ready. Press Install. It shows in My Mods, so you can turn it off any time.', 'green'); }
  async function takeOut() {
    if (!picked.length) { await ask('Pick one or more files in the list first.', 'Take Out', ['OK']); return; }
    const folder = await L.dialog.open({ folder: true, title: 'Where should the files go?' }); if (!folder) return;
    const r = await run(() => call('takeOut', picked, folder));
    if (!r) return;
    await ask('Took out ' + r.ok + ' file(s) to:\n' + folder + (r.bad.length ? "\n\nCouldn't take out: " + r.bad.slice(0, 5).join(', ') : ''), 'Take Out', ['OK']);
    if (r.ok) L.shell.open(folder);
  }
  async function replace() {
    if (picked.length !== 1) { await ask('Pick one file in the list to replace.', 'Replace', ['OK']); return; }
    const t = picked[0], ext = t.name.includes('.') ? t.name.split('.').pop() : '*';
    const f = await L.dialog.open({ title: 'Pick the new ' + t.name, filters: [{ name: 'Same type', extensions: [ext] }, { name: 'All files', extensions: ['*'] }] }); if (!f) return;
    const p = await run(() => call<Plan>('replacePlan', f, t)); if (p) goInstall(p);
  }
  async function add() {
    if (!cur) { await ask('Open an archive on the left first.', 'Add Files', ['OK']); return; }
    let folder = '';
    if (picked.length && picked[0].archive === cur && picked[0].inner.includes('/')) folder = picked[0].inner.substring(0, picked[0].inner.lastIndexOf('/') + 1);
    const fs = await L.dialog.open({ multi: true, title: 'Pick files to add to ' + baseName(cur) }); if (!fs || !fs.length) return;
    const p = await run(() => call<Plan>('addFilesPlan', cur, folder, fs)); if (p) goInstall(p);
  }
  async function textures() {
    if (picked.length !== 1 || !/\.wtd$/i.test(picked[0].inner)) { await ask('Pick one .wtd file in the list (texture files end with .wtd).', 'Textures', ['OK']); return; }
    const t = await run(() => call('openTextures', { archive: picked[0].archive, inner: picked[0].inner })); if (t) setTex(t);
  }
  async function view3d(f?: Item) {
    const t = f || (picked.length === 1 ? picked[0] : null);
    if (!t || !MODEL.test(t.inner)) { await ask('Pick one model in the list (.wdr object, .wft car, .wdd character).', '3D View', ['OK']); return; }
    const m = await run(() => call('openModel', { archive: t.archive, inner: t.inner }), 'Opening ' + t.name + ' in 3D...'); if (m) { setModel(m); status('', 'dim'); }
  }
  async function openModelFile() {
    const f = await L.dialog.open({ title: 'Pick a model file', filters: [{ name: 'GTA IV models', extensions: ['wdr', 'wft', 'wdd'] }] }); if (!f) return;
    const m = await run(() => call('openModel', { file: f }), 'Opening ' + baseName(f) + ' in 3D...'); if (m) { setModel(m); status('', 'dim'); }
  }
  async function openWtd() {
    const f = await L.dialog.open({ title: 'Pick a texture file', filters: [{ name: 'Texture files', extensions: ['wtd'] }] }); if (!f) return;
    const t = await run(() => call('openTextures', { file: f })); if (t) setTex({ ...t, file: f });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-5 pb-3 space-y-3 shrink-0">
        <PageTitle icon={<Archive className="w-6 h-6" />} title="Game Archives" sub="Look inside .img and .rpf files. Replacing or adding a file makes a mod you can turn off. Your originals are never changed."
          right={<div className="flex gap-2"><Btn icon={<Box className="w-4 h-4" />} onClick={openModelFile}>Open 3D Model...</Btn><Btn icon={<FolderOpen className="w-4 h-4" />} onClick={openWtd}>Open .wtd File...</Btn></div>} />
        <Card className="p-3 flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()} placeholder="Find a file by name (for example: hud.wtd)" className="w-full bg-[#111214] border border-[#363a44] rounded-lg pl-9 pr-3 py-2 text-[14px] outline-none focus:border-[#6ca4d8]" />
          </div>
          <Btn kind="primary" onClick={find} disabled={!game}>Find File</Btn>
          <span className="text-[13px] text-zinc-400">{info}</span>
        </Card>
      </div>
      <div className="flex-1 min-h-0 px-5 flex gap-4">
        <Card className="w-[340px] shrink-0 flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#363a44] text-[12px] font-bold uppercase tracking-wider text-zinc-400 font-barlow-condensed">Archives ({archives.length})</div>
          <div className="flex-1 overflow-y-auto">
            {archives.map((a) => (
              <button key={a.rel} onClick={() => openArchive(a.rel)} className={`w-full text-left px-4 py-2 border-b border-[#2a2d34] ${cur === a.rel && !searching ? 'bg-[#6ca4d8]/15' : 'hover:bg-white/[0.04]'}`}>
                <div className="text-[13.5px] text-zinc-100 font-semibold truncate">{a.name}</div>
                <div className="text-[11.5px] text-zinc-500 font-mono truncate">{a.where || 'game folder'}</div>
              </button>
            ))}
          </div>
        </Card>
        <Card className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="grid grid-cols-[minmax(160px,1.2fr)_minmax(140px,1fr)_90px_120px] gap-3 px-4 py-2.5 border-b border-[#363a44] text-[12px] font-bold uppercase tracking-wider text-zinc-400 font-barlow-condensed">
            <span>File</span><span>{searching ? 'In archive' : 'Inside'}</span><span>Size</span><span>Type</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {files.map((f, i) => (
              <div key={i} onClick={(e) => { const s = new Set(e.ctrlKey || e.metaKey ? sel : []); s.has(i) && (e.ctrlKey || e.metaKey) ? s.delete(i) : s.add(i); setSel(s); }}
                onDoubleClick={() => { if (/\.wtd$/i.test(f.inner)) { setSel(new Set([i])); run(() => call('openTextures', { archive: f.archive, inner: f.inner })).then((t) => t && setTex(t)); } else if (MODEL.test(f.inner)) { setSel(new Set([i])); view3d(f); } }}
                className={`grid grid-cols-[minmax(160px,1.2fr)_minmax(140px,1fr)_90px_120px] gap-3 px-4 py-1.5 border-b border-[#24272d] text-[13px] cursor-default ${sel.has(i) ? 'bg-[#6ca4d8]/20' : 'hover:bg-white/[0.03]'}`}>
                <span className="text-zinc-100 truncate">{f.name}</span><span className="text-zinc-500 font-mono text-[12px] truncate">{f.folder}</span><span className="text-zinc-400">{size(f.size)}</span><span className="text-zinc-400">{f.type}</span>
              </div>
            ))}
            {!files.length && <div className="p-10 text-center text-zinc-500 text-[14px]">{game ? 'Pick an archive on the left.' : 'Pick your GTA IV folder in Settings first.'}</div>}
          </div>
        </Card>
      </div>
      <div className="p-5 pt-3 shrink-0">
        <Card className="p-3 flex flex-wrap items-center gap-2">
          <Btn icon={<Download className="w-4 h-4" />} onClick={takeOut}>Take Out...</Btn>
          <Btn icon={<Replace className="w-4 h-4" />} onClick={replace}>Replace With...</Btn>
          <Btn icon={<FilePlus2 className="w-4 h-4" />} onClick={add}>Add Files...</Btn>
          <Btn icon={<ImageIcon className="w-4 h-4" />} onClick={textures}>Textures...</Btn>
          <Btn icon={<Box className="w-4 h-4" />} onClick={() => view3d()}>3D View...</Btn>
          <span className="text-[12.5px] text-zinc-500 ml-2">Tip: double-click a .wtd to see its pictures, or a model (.wft car, .wdd character, .wdr object) to see it in 3D.</span>
        </Card>
      </div>
      {model && <ModelViewer model={model} onClose={() => setModel(null)} />}
      {tex && <Textures tex={tex} onClose={async (r) => {
        setTex(null);
        if (r && r.plan) goInstall(r.plan);
        if (r && r.saved) await ask('Saved:\n' + r.saved, 'Textures', ['OK']);
      }} />}
    </div>
  );
};
