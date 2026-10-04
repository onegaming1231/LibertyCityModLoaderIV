import React, { useState } from 'react';
import { UploadCloud, FileArchive, FolderOpen, Image as ImageIcon, X, AlertTriangle, Info, PackageCheck, Box } from 'lucide-react';
import { ModelViewer } from '../modals/ModelViewer';
import { useApp } from '../App';
import { call, L, baseName, KIND_LABEL, KIND_STYLE, PlanRow, fileUrl } from '../api';
import { Btn, Card, PageTitle, Pill, Modal } from '../ui';

const GFX_NOTE = "Psst! Graphics mods (ENB, ReShade, RTX Remix) are the one thing I can't install. Drop those in by hand, and leave the rest to me ;)";

export const Install: React.FC = () => {
  const { plan, setPlan, loadMod, run, refresh, status, game, ask, updateQueue, nextUpdate, startDownload } = useApp();
  const [over, setOver] = useState(false);
  const [pics, setPics] = useState<number | null>(null);
  const [, force] = useState(0);
  const [model, setModel] = useState<any>(null);
  async function view3d(src: string) { const m = await run(() => call('openModel', { file: src }), 'Opening ' + baseName(src) + ' in 3D...'); if (m) { setModel(m); status('', 'dim'); } }

  async function chooseFile() {
    const p = await L.dialog.open({ title: 'Pick a mod', filters: [{ name: 'Mods', extensions: ['zip', 'rar', '7z', 'oiv'] }, { name: 'All files', extensions: ['*'] }] });
    if (p) loadMod(p);
  }
  async function chooseFolder() { const p = await L.dialog.open({ folder: true, title: 'Pick the mod folder' }); if (p) loadMod(p); }
  async function cancel() { if (plan) await call('cancelPlan', plan.id).catch(() => {}); setPlan(null); updateQueue.current = []; status('Cancelled. Nothing was installed.', 'dim'); }
  async function rowClick(r: PlanRow, i: number) {
    if (!plan) return;
    if (r.Kind === 'PREVIEW') { setPics(i); return; }
    if ((r.Kind === 'MANUAL' || (r.Kind === 'SKIP' && r.Note.startsWith('Left out'))) && !/\.exe$/i.test(r.Source)) {
      const f = await L.dialog.open({ folder: true, title: 'Where does ' + baseName(r.Source) + ' go? Pick a folder inside your GTA IV folder.', defaultPath: game });
      if (!f) return;
      const nr = await run(() => call<PlanRow>('chooseRowFolder', plan.id, i, f));
      if (nr) { plan.rows[i] = nr; setPlan({ ...plan }); force((x) => x + 1); }
    }
  }
  async function install() {
    if (!plan) return;
    const r = await run(() => call('install', plan.id), "Installing '" + plan.modName + "'...");
    if (!r || !r.ok) return;
    setPlan(null); await refresh();
    if (r.rtx && !(await L.file.exists(game + '/rtx-remix/mods/gta4rtx/mod.usda'))) {
      const a = await ask('GTA IV RTX Remix also needs its Base Remix Mod (free, from the RTX mod\'s author on GitHub).\n\nDownload it now? It opens in Install. Then press Install.', 'One more piece needed', ['Yes', 'No']);
      if (a === 'Yes') await startDownload({ url: 'https://github.com/xoxor4d/gta4-rtx-base-mod/archive/refs/heads/master.zip', fileName: 'gta4-rtx-base-mod.zip', modName: 'RTX Base Mod' });
      else status("RTX Remix won't fully work until the Base Remix Mod is installed.", 'amber');
    }
    if (updateQueue.current.length) await nextUpdate();
  }
  const rows = plan?.rows || [];
  const ready = rows.filter((r) => r.Dest && !['SKIP', 'MANUAL', 'PREVIEW'].includes(r.Kind)).length;
  const manual = rows.filter((r) => r.Kind === 'MANUAL').length;
  const skip = rows.filter((r) => r.Kind === 'SKIP' || r.Kind === 'PREVIEW').length;
  const previews = rows.map((r, i) => ({ r, i })).filter((x) => x.r.Kind === 'PREVIEW');

  return (
    <div className="h-full overflow-y-auto"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); (e.nativeEvent as any).handledByPage = true; setOver(false); const f = e.dataTransfer.files[0]; if (f) loadMod(L.pathOf(f)); }}>
      <div className="max-w-[1400px] mx-auto p-5 space-y-4">
        <PageTitle icon={<UploadCloud className="w-6 h-6" />} title="Install" sub="Check where each file goes. Your original game files are never touched." />
        <div className="rounded-xl border border-[#6ca4d8]/40 bg-[#18222d]/90 backdrop-blur-md px-4 py-3 text-[13.5px] text-[#b9d6f1] flex items-start gap-2.5"><Info className="w-4 h-4 mt-0.5 shrink-0" />{GFX_NOTE}</div>

        {!plan && (
          <div className={`rounded-xl border-2 border-dashed ${over ? 'border-[#6ca4d8] bg-[#6ca4d8]/10' : 'border-[#46628a] bg-[#1b1d21]/85'} backdrop-blur-md px-6 py-14 flex flex-col items-center text-center transition-colors`}>
            <div className="w-16 h-16 rounded-full bg-[#24262c] border border-[#363a44] flex items-center justify-center mb-4"><FileArchive className="w-7 h-7 text-[#6ca4d8]" /></div>
            <h3 className="text-[28px] font-bebas tracking-wide text-white">Drop a mod here</h3>
            <p className="text-[14px] text-zinc-400 mt-1">.zip  .rar  .7z  .oiv  or a folder - from any website</p>
            <div className="flex gap-3 mt-5">
              <Btn kind="primary" icon={<FileArchive className="w-4 h-4" />} onClick={chooseFile} disabled={!game}>Choose File...</Btn>
              <Btn icon={<FolderOpen className="w-4 h-4" />} onClick={chooseFolder} disabled={!game}>Choose Folder...</Btn>
            </div>
            {!game && <p className="text-amber-300 text-[13px] mt-4">Pick your GTA IV folder in Settings first.</p>}
          </div>
        )}

        {plan && (
          <>
            <Card className="p-4 flex flex-wrap items-center gap-3">
              <span className="text-[14px] text-zinc-400 font-semibold">Mod name</span>
              <input value={plan.modName} onChange={(e) => { const v = e.target.value; setPlan({ ...plan, modName: v }); call('setPlanName', plan.id, v); }}
                className="flex-1 min-w-[240px] bg-[#111214] border border-[#363a44] rounded-lg px-3 py-2 text-[17px] font-semibold text-white outline-none focus:border-[#6ca4d8]" />
              <Pill className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40 text-[12px] py-1">{ready} ready</Pill>
              {manual > 0 && <Pill className="bg-amber-500/15 text-amber-300 border-amber-500/40 text-[12px] py-1">{manual} need you</Pill>}
              {skip > 0 && <Pill className="bg-zinc-700/40 text-zinc-300 border-zinc-600 text-[12px] py-1">{skip} not needed</Pill>}
            </Card>
            {plan.warning && <div className="rounded-xl border border-amber-500/50 bg-[#2a2519]/92 px-4 py-3 text-[14px] text-amber-100 flex gap-2.5"><AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />{plan.warning}</div>}
            {plan.checks.length > 0 && (
              <div className="rounded-xl border border-amber-500/40 bg-[#26231b]/92 px-4 py-3">
                <div className="text-[13px] font-bold uppercase tracking-wide text-amber-300 font-barlow-condensed mb-1.5">Before you install</div>
                <ul className="space-y-1.5">{plan.checks.map((c, i) => <li key={i} className="text-[13.5px] text-zinc-200 whitespace-pre-wrap leading-snug">- {c}</li>)}</ul>
              </div>
            )}
            <Card className="overflow-hidden">
              <div className="grid grid-cols-[minmax(160px,1.1fr)_minmax(200px,1.3fr)_120px_minmax(200px,1.4fr)] gap-3 px-4 py-2.5 border-b border-[#363a44] text-[12px] font-bold uppercase tracking-wider text-zinc-400 font-barlow-condensed">
                <span>File</span><span>Goes to</span><span>Type</span><span>Why</span>
              </div>
              <div className="max-h-[52vh] overflow-y-auto">
                {rows.map((r, i) => {
                  const clickable = r.Kind === 'PREVIEW' || ((r.Kind === 'MANUAL' || (r.Kind === 'SKIP' && r.Note.startsWith('Left out'))) && !/\.exe$/i.test(r.Source));
                  return (
                    <div key={i} onClick={() => rowClick(r, i)} className={`grid grid-cols-[minmax(160px,1.1fr)_minmax(200px,1.3fr)_120px_minmax(200px,1.4fr)] gap-3 px-4 py-2 border-b border-[#2a2d34] text-[13px] ${clickable ? 'cursor-pointer hover:bg-white/[0.04]' : ''}`}>
                      <span className="text-zinc-100 truncate flex items-center gap-1.5" title={r.Source}>
                        {/\.(wdr|wft|wdd)$/i.test(r.Source) && <button title="See it in 3D" onClick={(e) => { e.stopPropagation(); view3d(r.Source); }} className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#6ca4d8]/50 text-[#9cc6ee] text-[11px] font-bold hover:bg-[#6ca4d8]/20"><Box className="w-3 h-3" />3D</button>}
                        <span className="truncate">{baseName(r.Source)}</span>
                      </span>
                      <span className="text-zinc-400 font-mono text-[12px] truncate" title={r.Dest}>{r.Dest ? r.Dest.replace('|', ' > ') : '-'}</span>
                      <span><Pill className={KIND_STYLE[r.Kind] || ''}>{KIND_LABEL[r.Kind] || r.Kind}</Pill></span>
                      <span className={`leading-snug ${r.Kind === 'MANUAL' ? 'text-amber-200' : 'text-zinc-400'}`}>{r.Note}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13.5px] text-zinc-400">{manual ? 'Click a yellow row to choose where it goes (the app remembers it).' : 'Everything has a place. Press Install.'}</span>
              <div className="flex gap-2">
                <Btn icon={<X className="w-4 h-4" />} onClick={cancel}>Cancel</Btn>
                {previews.length > 0 && <Btn icon={<ImageIcon className="w-4 h-4" />} onClick={() => setPics(previews[0].i)}>View Pictures</Btn>}
                <Btn kind="primary" className="px-8 text-[15px]" icon={<PackageCheck className="w-5 h-5" />} onClick={install} disabled={!ready || !plan.modName.trim()}>Install</Btn>
              </div>
            </Card>
          </>
        )}
      </div>
      {model && <ModelViewer model={model} onClose={() => setModel(null)} />}
      {pics !== null && plan && (
        <Pictures rows={previews.map((x) => x.r)} start={Math.max(0, previews.findIndex((x) => x.i === pics))} onClose={() => setPics(null)} />
      )}
    </div>
  );
};

const Pictures: React.FC<{ rows: PlanRow[]; start: number; onClose: () => void }> = ({ rows, start, onClose }) => {
  const [i, setI] = useState(start);
  const r = rows[i];
  return (
    <Modal title={'Pictures  -  ' + (i + 1) + ' of ' + rows.length} sub={baseName(r.Source)} icon={<ImageIcon className="w-5 h-5" />} onClose={onClose} width="max-w-5xl"
      footer={<><Btn disabled={i <= 0} onClick={() => setI(i - 1)}>Back</Btn><Btn disabled={i >= rows.length - 1} onClick={() => setI(i + 1)}>Next</Btn><Btn kind="primary" onClick={onClose}>Close</Btn></>}>
      <div className="p-4 bg-black/40 flex items-center justify-center min-h-[50vh]"><img src={fileUrl(r.Source)} className="max-w-full max-h-[64vh] object-contain rounded" /></div>
    </Modal>
  );
};
